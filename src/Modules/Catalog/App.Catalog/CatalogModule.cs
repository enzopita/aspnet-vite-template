using App.BuildingBlocks.Persistence;
using App.Catalog.Contracts;
using App.Catalog.Features.Products.AdjustStock;
using App.Catalog.Features.Products.CreateProduct;
using App.Catalog.Features.Products.ListProducts;
using App.Catalog.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace App.Catalog;

/// <summary>Composition entry point for the Catalog module (ADR 0002).</summary>
public static class CatalogModule
{
    public static IServiceCollection AddCatalogModule(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddDbContext<CatalogDbContext>(options =>
            options
                .UseNpgsql(
                    configuration.GetConnectionString("app"),
                    npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", CatalogDbContext.Schema))
                .UseSnakeCaseNamingConvention());

        services.AddScoped<IModuleMigrator, CatalogDbMigrator>();
        services.AddScoped<ICatalogQueries, CatalogQueries>();
        services.AddScoped<CreateProductHandler>();
        services.AddScoped<ListProductsHandler>();
        services.AddScoped<AdjustStockHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.NewVersionedApi("Catalog")
            .MapGroup("/api/v{version:apiVersion}/catalog")
            .HasApiVersion(1, 0);

        group.MapCreateProduct();
        group.MapListProducts();
        group.MapAdjustStock();

        return app;
    }
}
