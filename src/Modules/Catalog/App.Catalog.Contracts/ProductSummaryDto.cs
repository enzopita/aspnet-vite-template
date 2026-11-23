namespace App.Catalog.Contracts;

/// <summary>Summary projection of a catalog product exposed to other modules.</summary>
public sealed record ProductSummaryDto(
    Guid Id,
    string Sku,
    string Name,
    decimal Price,
    int StockQuantity);
