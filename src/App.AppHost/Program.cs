var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithImageTag("18-alpine")
    .WithDataVolume();

var db = postgres.AddDatabase("app");

var api = builder.AddDotnetProject("api", "../App.Api/App.Api.csproj")
    .WithReference(db)
    .WaitFor(db);

builder.AddViteApp("web", "../../web")
    .WithPnpm()
    .WithReference(api)
    .WaitFor(api)
    .WithExternalHttpEndpoints();

builder.Build().Run();
