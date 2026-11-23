using System.Net;
using App.Api.IntegrationTests.Support;

namespace App.Api.IntegrationTests.Catalog;

public sealed class CatalogConcurrencyTests(AppApiFactory factory)
{
    private sealed record CreatedProductDto(Guid Id);

    private sealed record ProductItemDto(Guid Id, string Sku, int StockQuantity);

    private sealed record ListProductsPageDto(IReadOnlyList<ProductItemDto> Items);

    [Fact]
    public async Task Concurrent_stock_deductions_never_oversell_below_zero()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var sku = $"RACE-{Guid.CreateVersion7():N}";

        var create = await client.PostAsJsonAsync(
            "/api/v1/catalog/products",
            new { sku, name = "Limited Widget", price = 99.00m, initialStock = 5 },
            ct);
        create.StatusCode.ShouldBe(HttpStatusCode.Created);
        var product = await create.Content.ReadFromJsonAsync<CreatedProductDto>(ct);
        product.ShouldNotBeNull();

        const int Contenders = 8;
        using var gate = new ManualResetEventSlim(false);
        var tasks = Enumerable.Range(0, Contenders).Select(async _ =>
        {
            await Task.Run(() => gate.Wait(ct), ct);
            using var contenderClient = factory.CreateClient();
            return await contenderClient.PostAsJsonAsync(
                $"/api/v1/catalog/products/{product.Id}/stock",
                new { delta = -3 },
                ct);
        }).ToArray();

        gate.Set();
        var responses = await Task.WhenAll(tasks);

        var succeeded = responses.Where(r => r.StatusCode == HttpStatusCode.OK).ToList();
        var conflicts = responses.Where(r => r.StatusCode == HttpStatusCode.Conflict).ToList();

        succeeded.Count.ShouldBe(1);
        conflicts.Count.ShouldBe(Contenders - 1);

        foreach (var conflict in conflicts)
        {
            var code = await conflict.ReadProblemCodeAsync();
            code.ShouldBeOneOf("catalog.product.concurrency-conflict", "catalog.product.insufficient-stock");
        }

        var list = await client.GetFromJsonAsync<ListProductsPageDto>(
            new Uri($"/api/v1/catalog/products?search={sku}", UriKind.Relative),
            ct);
        list.ShouldNotBeNull();
        var stored = list.Items.Single(p => p.Id == product.Id);
        stored.StockQuantity.ShouldBe(2);
    }
}
