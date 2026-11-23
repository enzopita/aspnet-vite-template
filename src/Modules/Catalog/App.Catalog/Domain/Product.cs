using App.SharedKernel;

namespace App.Catalog.Domain;

internal sealed class Product
{
    public const int MaxSkuLength = 64;
    public const int MaxNameLength = 200;

    private Product()
    {
    }

    private Product(
        Guid id,
        string sku,
        string name,
        decimal price,
        int stockQuantity,
        DateTimeOffset utcNow)
    {
        Id = id;
        Sku = sku;
        Name = name;
        Price = price;
        StockQuantity = stockQuantity;
        Version = 1;
        CreatedAtUtc = utcNow;
        UpdatedAtUtc = utcNow;
    }

    public Guid Id { get; private set; }
    public string Sku { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public decimal Price { get; private set; }
    public int StockQuantity { get; private set; }
    public int Version { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Result<Product> Create(
        string? sku,
        string? name,
        decimal price,
        int initialStock,
        DateTimeOffset utcNow)
    {
        var normalizedSku = sku?.Trim().ToUpperInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedSku))
        {
            return CatalogErrors.SkuRequired;
        }

        if (normalizedSku.Length > MaxSkuLength)
        {
            return CatalogErrors.SkuTooLong;
        }

        var normalizedName = name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            return CatalogErrors.NameRequired;
        }

        if (normalizedName.Length > MaxNameLength)
        {
            return CatalogErrors.NameTooLong;
        }

        if (price < 0)
        {
            return CatalogErrors.InvalidPrice;
        }

        if (initialStock < 0)
        {
            return CatalogErrors.InvalidStock;
        }

        return new Product(
            Guid.CreateVersion7(),
            normalizedSku,
            normalizedName,
            price,
            initialStock,
            utcNow);
    }

    public Result AdjustStock(int delta, DateTimeOffset utcNow)
    {
        if (delta == 0)
        {
            return CatalogErrors.InvalidAdjustment;
        }

        if (StockQuantity + delta < 0)
        {
            return CatalogErrors.InsufficientStock;
        }

        StockQuantity += delta;
        Version++;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }
}
