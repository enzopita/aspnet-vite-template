using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(App.Api.IntegrationTests.AppApiFactory))]

namespace App.Api.IntegrationTests;

/// <summary>
/// Boots the real API against a throwaway PostgreSQL container: the database is never mocked.
/// Shared by every test in the assembly; migrations run on startup like in production.
/// </summary>
public class AppApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18-alpine").Build();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync(TestContext.Current.CancellationToken);

        // Start the host once, here: WebApplicationFactory's lazy start isn't safe under parallel test classes.
        _ = Server;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:app", _postgres.GetConnectionString());
        builder.ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Warning));
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}
