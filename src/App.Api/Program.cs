using System.Text.Json;
using System.Text.Json.Serialization;
using App.BuildingBlocks.Http;
using App.BuildingBlocks.Persistence;
using App.Catalog;
using App.SharedKernel;
using Asp.Versioning;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context =>
    {
        if (!context.ProblemDetails.Extensions.ContainsKey(ErrorHttpExtensions.CodeExtension))
        {
            context.ProblemDetails.Extensions[ErrorHttpExtensions.CodeExtension] = context.HttpContext.Response.StatusCode switch
            {
                StatusCodes.Status400BadRequest => "http.request.invalid",
                StatusCodes.Status404NotFound => "http.endpoint.not-found",
                _ => "http.unexpected",
            };
        }
    });

builder.Services.AddApiVersioning(options =>
{
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = new UrlSegmentApiVersionReader();
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

builder.Services.AddOpenApi("v1", options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = "App API";
        document.Info.Version = "v1";
        return Task.CompletedTask;
    });
});

builder.Services.AddModuleMigrations();
builder.Services.AddCatalogModule(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.MapOpenApi();
}

if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference();
}

app.MapDefaultEndpoints();
app.MapCatalogEndpoints();

app.Map("/api/{**rest}", (string? rest) =>
    Error.NotFound("http.endpoint.not-found", $"No endpoint matches '/api/{rest}'.").ToProblem())
    .ExcludeFromDescription();

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Entry point marker for integration and architecture tests.</summary>
public partial class Program;
