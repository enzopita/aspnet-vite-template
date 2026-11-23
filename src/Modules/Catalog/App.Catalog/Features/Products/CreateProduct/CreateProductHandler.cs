using App.Catalog.Domain;
using App.Catalog.Persistence;
using App.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace App.Catalog.Features.Products.CreateProduct;

internal sealed record CreateProductRequest(
    string Sku,
    string Name,
    decimal Price,
    int InitialStock);

internal sealed record CreateProductResponse(
    Guid Id,
    string Sku,
    string Name,
    decimal Price,
    int StockQuantity,
    DateTimeOffset CreatedAtUtc);

internal sealed class CreateProductHandler(CatalogDbContext db, TimeProvider timeProvider)
{
    public async Task<Result<CreateProductResponse>> HandleAsync(
        CreateProductRequest request,
        CancellationToken cancellationToken)
    {
        var created = Product.Create(
            request.Sku,
            request.Name,
            request.Price,
            request.InitialStock,
            timeProvider.GetUtcNow());

        if (!created.IsSuccess)
        {
            return created.Error;
        }

        var product = created.Value;
        var skuTaken = await db.Products.AnyAsync(p => p.Sku == product.Sku, cancellationToken);
        if (skuTaken)
        {
            return CatalogErrors.SkuTaken;
        }

        db.Products.Add(product);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return CatalogErrors.SkuTaken;
        }

        return new CreateProductResponse(
            product.Id,
            product.Sku,
            product.Name,
            product.Price,
            product.StockQuantity,
            product.CreatedAtUtc);
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
