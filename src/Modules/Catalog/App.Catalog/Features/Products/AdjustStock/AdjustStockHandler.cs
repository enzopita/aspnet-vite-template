using App.Catalog.Domain;
using App.Catalog.Persistence;
using App.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace App.Catalog.Features.Products.AdjustStock;

internal sealed record AdjustStockRequest(int Delta);

internal sealed record AdjustStockResponse(
    Guid Id,
    string Sku,
    int StockQuantity,
    int Version,
    DateTimeOffset UpdatedAtUtc);

internal sealed class AdjustStockHandler(CatalogDbContext db, TimeProvider timeProvider)
{
    public async Task<Result<AdjustStockResponse>> HandleAsync(
        Guid productId,
        AdjustStockRequest request,
        CancellationToken cancellationToken)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId, cancellationToken);
        if (product is null)
        {
            return CatalogErrors.NotFound;
        }

        var adjusted = product.AdjustStock(request.Delta, timeProvider.GetUtcNow());
        if (!adjusted.IsSuccess)
        {
            return adjusted.Error;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return CatalogErrors.ConcurrencyConflict;
        }

        return new AdjustStockResponse(
            product.Id,
            product.Sku,
            product.StockQuantity,
            product.Version,
            product.UpdatedAtUtc);
    }
}
