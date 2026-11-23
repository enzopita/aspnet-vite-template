using App.Catalog.Domain;
using App.Catalog.Persistence;
using App.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace App.Catalog.Features.Products.ListProducts;

internal sealed record ListProductsQuery(
    int Page,
    int PageSize,
    string? Search);

internal sealed record ProductListItem(
    Guid Id,
    string Sku,
    string Name,
    decimal Price,
    int StockQuantity,
    int Version,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

internal sealed record ListProductsResponse(
    IReadOnlyList<ProductListItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

internal sealed class ListProductsHandler(CatalogDbContext db)
{
    private const int MaxPageSize = 100;

    public async Task<Result<ListProductsResponse>> HandleAsync(
        ListProductsQuery query,
        CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > MaxPageSize)
        {
            return CatalogErrors.InvalidPagination;
        }

        var products = db.Products.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{EscapeLikePattern(query.Search.Trim())}%";
            products = products.Where(p =>
                EF.Functions.ILike(p.Sku, pattern, "\\")
                || EF.Functions.ILike(p.Name, pattern, "\\"));
        }

        var totalCount = await products.CountAsync(cancellationToken);
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)query.PageSize);

        var items = await products
            .OrderByDescending(p => p.CreatedAtUtc)
            .ThenByDescending(p => p.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(p => new ProductListItem(
                p.Id,
                p.Sku,
                p.Name,
                p.Price,
                p.StockQuantity,
                p.Version,
                p.CreatedAtUtc,
                p.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        return new ListProductsResponse(items, query.Page, query.PageSize, totalCount, totalPages);
    }

    private static string EscapeLikePattern(string value) =>
        value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
