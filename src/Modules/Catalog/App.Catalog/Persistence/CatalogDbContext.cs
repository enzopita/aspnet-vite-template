using App.Catalog.Domain;
using App.Catalog.Persistence.Configurations;
using Microsoft.EntityFrameworkCore;

namespace App.Catalog.Persistence;

internal sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public const string Schema = "catalog";

    public DbSet<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfiguration(new ProductConfiguration());
    }
}
