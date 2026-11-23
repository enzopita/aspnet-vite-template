using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace App.BuildingBlocks.Persistence;

/// <summary>Applies database migrations for a single module during host startup.</summary>
public interface IModuleMigrator
{
    Task MigrateAsync(CancellationToken cancellationToken);
}

internal sealed class ModuleMigrationHostedService(IServiceScopeFactory scopeFactory) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Build-time OpenAPI generation (GetDocument.Insider) boots the host without a database.
        if (string.Equals(Assembly.GetEntryAssembly()?.GetName().Name, "GetDocument.Insider", StringComparison.Ordinal))
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var migrators = scope.ServiceProvider.GetServices<IModuleMigrator>();
        foreach (var migrator in migrators)
        {
            await migrator.MigrateAsync(cancellationToken);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

/// <summary>Registers startup migration execution for module <see cref="IModuleMigrator"/> services.</summary>
public static class ModuleMigrationExtensions
{
    public static IServiceCollection AddModuleMigrations(this IServiceCollection services)
    {
        services.AddHostedService<ModuleMigrationHostedService>();
        return services;
    }
}
