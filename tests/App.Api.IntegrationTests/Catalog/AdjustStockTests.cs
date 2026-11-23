using System.Net;
using App.Api.IntegrationTests.Support;

namespace App.Api.IntegrationTests.Catalog;

public sealed class AdjustStockTests(AppApiFactory factory)
{
    private sealed record CreatedProductDto(Guid Id);

    private sealed record AdjustedStockDto(
        Guid Id,
        string Sku,
        int StockQuantity,
        int Version,
        DateTimeOffset UpdatedAtUtc);

    [Fact]
    public async Task Adjust_stock_updates_quantity_and_rejects_negative_balance()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var sku = $"STK-{Guid.CreateVersion7():N}";

        var create = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku, name = "Stocked Item", price = 50.00m, initialStock = 10 },
            ct);
        create.StatusCode.ShouldBe(HttpStatusCode.Created);
        var product = await create.Content.ReadFromJsonAsync<CreatedProductDto>(ct);
        product.ShouldNotBeNull();

        var add = await client.PostAsJsonAsync(
            $"/api/v1/catalog/products/{product.Id}/stock",
            new { delta = 5 },
            ct);
        add.StatusCode.ShouldBe(HttpStatusCode.OK);
        var added = await add.Content.ReadFromJsonAsync<AdjustedStockDto>(ct);
        added.ShouldNotBeNull();
        added.StockQuantity.ShouldBe(15);
        added.Version.ShouldBe(2);

        var deduct = await client.PostAsJsonAsync(
            $"/api/v1/catalog/products/{product.Id}/stock",
            new { delta = -20 },
            ct);
        deduct.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await deduct.ReadProblemCodeAsync()).ShouldBe("catalog.product.insufficient-stock");
    }

    [Fact]
    public async Task Zero_delta_returns_400_and_missing_product_returns_404()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var missing = await client.PostAsJsonAsync(
            $"/api/v1/catalog/products/{Guid.CreateVersion7()}/stock",
            new { delta = 1 },
            ct);
        missing.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await missing.ReadProblemCodeAsync()).ShouldBe("catalog.product.not-found");

        var create = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku = $"ZERO-{Guid.CreateVersion7():N}", name = "Zero Delta Item", price = 10.00m, initialStock = 2 },
            ct);
        create.StatusCode.ShouldBe(HttpStatusCode.Created);
        var product = await create.Content.ReadFromJsonAsync<CreatedProductDto>(ct);
        product.ShouldNotBeNull();

        var zero = await client.PostAsJsonAsync(
            $"/api/v1/catalog/products/{product.Id}/stock",
            new { delta = 0 },
            ct);
        zero.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await zero.ReadProblemCodeAsync()).ShouldBe("catalog.product.invalid-adjustment");
    }
}
