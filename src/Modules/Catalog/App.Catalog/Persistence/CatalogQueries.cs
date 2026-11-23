using App.BuildingBlocks.Persistence;
using App.Catalog.Contracts;
using Microsoft.EntityFrameworkCore;

namespace App.Catalog.Persistence;

internal sealed class CatalogQueries(CatalogDbContext db) : ICatalogQueries
{
    public Task<ProductSummaryDto?> GetProductByIdAsync(Guid productId, CancellationToken cancellationToken = default) =>
        db.Products
            .AsNoTracking()
            .Where(p => p.Id == productId)
            .Select(p => new ProductSummaryDto(p.Id, p.Sku, p.Name, p.Price, p.StockQuantity))
            .FirstOrDefaultAsync(cancellationToken);
}

internal sealed class CatalogDbMigrator(CatalogDbContext db) : IModuleMigrator
{
    public Task MigrateAsync(CancellationToken cancellationToken) =>
        db.Database.MigrateAsync(cancellationToken);
}
