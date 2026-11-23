using App.BuildingBlocks.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace App.Catalog.Features.Products.CreateProduct;

internal static class CreateProductEndpoint
{
    public static void MapCreateProduct(this RouteGroupBuilder group) =>
        group.MapPost("/products", HandleAsync)
            .WithName("CreateProduct")
            .WithSummary("Create a product in the catalog")
            .WithTags("Catalog")
            .Produces<CreateProductResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict);

    private static async Task<IResult> HandleAsync(
        CreateProductRequest request,
        CreateProductHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(request, cancellationToken);
        return result.IsSuccess
            ? TypedResults.Created($"/api/v1/catalog/products/{result.Value.Id}", result.Value)
            : result.Error.ToProblem();
    }
}
