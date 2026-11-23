using App.Catalog.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace App.Catalog.Persistence.Configurations;

internal sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products", table =>
            table.HasCheckConstraint("ck_products_stock_non_negative", "stock_quantity >= 0"));

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();

        builder.Property(p => p.Sku)
            .HasMaxLength(Product.MaxSkuLength)
            .IsRequired();

        builder.HasIndex(p => p.Sku).IsUnique();

        builder.Property(p => p.Name)
            .HasMaxLength(Product.MaxNameLength)
            .IsRequired();

        builder.Property(p => p.Price)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(p => p.StockQuantity)
            .IsRequired();

        builder.Property(p => p.Version)
            .IsConcurrencyToken()
            .IsRequired();

        builder.Property(p => p.CreatedAtUtc).IsRequired();
        builder.Property(p => p.UpdatedAtUtc).IsRequired();
    }
}
