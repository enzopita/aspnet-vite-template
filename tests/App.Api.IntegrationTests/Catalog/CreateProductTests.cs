using System.Net;
using App.Api.IntegrationTests.Support;

namespace App.Api.IntegrationTests.Catalog;

public sealed class CreateProductTests(AppApiFactory factory)
{
    private sealed record CreatedProductDto(
        Guid Id,
        string Sku,
        string Name,
        decimal Price,
        int StockQuantity,
        DateTimeOffset CreatedAtUtc);

    [Fact]
    public async Task Create_product_returns_201_and_normalizes_sku()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var sku = $"sku-{Guid.CreateVersion7():N}";

        var response = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku, name = "  Mechanical Keyboard  ", price = 149.90m, initialStock = 12 },
            ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<CreatedProductDto>(ct);
        created.ShouldNotBeNull();
        created.Sku.ShouldBe(sku.ToUpperInvariant());
        created.Name.ShouldBe("Mechanical Keyboard");
        created.Price.ShouldBe(149.90m);
        created.StockQuantity.ShouldBe(12);
    }

    [Fact]
    public async Task Duplicate_sku_returns_409_with_sku_taken_code()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var sku = $"DUP-{Guid.CreateVersion7():N}";

        var first = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku, name = "First Product", price = 10.00m, initialStock = 5 },
            ct);
        first.StatusCode.ShouldBe(HttpStatusCode.Created);

        var duplicate = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku = sku.ToLowerInvariant(), name = "Second Product", price = 20.00m, initialStock = 3 },
            ct);

        duplicate.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await duplicate.ReadProblemCodeAsync()).ShouldBe("catalog.product.sku-taken");
    }

    [Theory]
    [InlineData("", "Valid Name", 10.0, 1, "catalog.product.sku-required")]
    [InlineData("SKU-VALID", " ", 10.0, 1, "catalog.product.name-required")]
    [InlineData("SKU-VALID", "Valid Name", -1.0, 1, "catalog.product.invalid-price")]
    [InlineData("SKU-VALID", "Valid Name", 10.0, -5, "catalog.product.invalid-stock")]
    public async Task Invalid_payload_returns_400_with_problem_code(
        string sku,
        string name,
        double price,
        int initialStock,
        string expectedCode)
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var response = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku, name, price = (decimal)price, initialStock },
            ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await response.ReadProblemCodeAsync()).ShouldBe(expectedCode);
    }
}
