using App.BuildingBlocks.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace App.Catalog.Features.Products.AdjustStock;

internal static class AdjustStockEndpoint
{
    public static void MapAdjustStock(this RouteGroupBuilder group) =>
        group.MapPost("/products/{productId:guid}/stock", HandleAsync)
            .WithName("AdjustStock")
            .WithSummary("Adjust a product's stock quantity")
            .WithTags("Catalog")
            .Produces<AdjustStockResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

    private static async Task<IResult> HandleAsync(
        Guid productId,
        AdjustStockRequest request,
        AdjustStockHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(productId, request, cancellationToken);
        return result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error.ToProblem();
    }
}
