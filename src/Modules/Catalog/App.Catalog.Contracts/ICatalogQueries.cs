namespace App.Catalog.Contracts;

/// <summary>Public read queries exposed by the Catalog module (ADR 0003).</summary>
public interface ICatalogQueries
{
    Task<ProductSummaryDto?> GetProductByIdAsync(Guid productId, CancellationToken cancellationToken = default);
}
