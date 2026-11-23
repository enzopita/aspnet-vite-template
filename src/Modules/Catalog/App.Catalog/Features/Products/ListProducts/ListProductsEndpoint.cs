using App.BuildingBlocks.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace App.Catalog.Features.Products.ListProducts;

internal static class ListProductsEndpoint
{
    private const int DefaultPage = 1;
    private const int DefaultPageSize = 20;

    public static void MapListProducts(this RouteGroupBuilder group) =>
        group.MapGet("/products", HandleAsync)
            .WithName("ListProducts")
            .WithSummary("List catalog products with pagination and search")
            .WithTags("Catalog")
            .Produces<ListProductsResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest);

    private static async Task<IResult> HandleAsync(
        [FromQuery(Name = "page")] int? page,
        [FromQuery(Name = "page-size")] int? pageSize,
        [FromQuery(Name = "search")] string? search,
        ListProductsHandler handler,
        CancellationToken cancellationToken)
    {
        var query = new ListProductsQuery(page ?? DefaultPage, pageSize ?? DefaultPageSize, search);
        var result = await handler.HandleAsync(query, cancellationToken);
        return result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error.ToProblem();
    }
}
