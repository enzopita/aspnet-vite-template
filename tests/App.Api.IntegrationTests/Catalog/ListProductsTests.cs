using System.Net;
using App.Api.IntegrationTests.Support;

namespace App.Api.IntegrationTests.Catalog;

public sealed class ListProductsTests(AppApiFactory factory)
{
    private sealed record ProductItemDto(
        Guid Id,
        string Sku,
        string Name,
        decimal Price,
        int StockQuantity,
        int Version,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed record ListProductsPageDto(
        IReadOnlyList<ProductItemDto> Items,
        int Page,
        int PageSize,
        int TotalCount,
        int TotalPages);

    [Fact]
    public async Task List_products_supports_kebab_case_pagination_and_search()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var tag = $"LIST-{Guid.CreateVersion7():N}";

        for (var i = 1; i <= 3; i++)
        {
            var create = await client.PostAsJsonAsync(
                "/api/v1/catalog/products",
                new { sku = $"{tag}-{i}", name = $"Widget {tag} #{i}", price = 15.00m * i, initialStock = i },
                ct);
            create.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        var page1Response = await client.GetAsync(
            new Uri($"/api/v1/catalog/products?page=1&page-size=2&search={tag.ToLowerInvariant()}", UriKind.Relative),
            ct);

        page1Response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var page1 = await page1Response.Content.ReadFromJsonAsync<ListProductsPageDto>(ct);
        page1.ShouldNotBeNull();
        page1.Page.ShouldBe(1);
        page1.PageSize.ShouldBe(2);
        page1.TotalCount.ShouldBe(3);
        page1.TotalPages.ShouldBe(2);
        page1.Items.Count.ShouldBe(2);

        var page2Response = await client.GetAsync(
            new Uri($"/api/v1/catalog/products?page=2&page-size=2&search={tag}", UriKind.Relative),
            ct);

        page2Response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var page2 = await page2Response.Content.ReadFromJsonAsync<ListProductsPageDto>(ct);
        page2.ShouldNotBeNull();
        page2.Page.ShouldBe(2);
        page2.Items.Count.ShouldBe(1);
    }

    [Fact]
    public async Task Invalid_page_size_returns_400_with_problem_code()
    {
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var response = await client.GetAsync(
            new Uri("/api/v1/catalog/products?page=1&page-size=500", UriKind.Relative),
            ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await response.ReadProblemCodeAsync()).ShouldBe("catalog.product.invalid-pagination");
    }
}
