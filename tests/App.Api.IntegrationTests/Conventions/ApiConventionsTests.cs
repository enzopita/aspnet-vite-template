using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using App.Api.IntegrationTests.Support;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.DependencyInjection;

namespace App.Api.IntegrationTests.Conventions;

/// <summary>Enforces ADR 0004 across every described endpoint.</summary>
public sealed partial class ApiConventionsTests(AppApiFactory factory)
{
    [Fact]
    public void Every_path_segment_and_query_parameter_is_kebab_case()
    {
        var descriptions = factory.Services
            .GetRequiredService<IApiDescriptionGroupCollectionProvider>()
            .ApiDescriptionGroups.Items
            .SelectMany(group => group.Items)
            .ToList();

        descriptions.ShouldNotBeEmpty();

        var violations = new List<string>();
        foreach (var description in descriptions)
        {
            var path = description.RelativePath ?? string.Empty;

            violations.AddRange(path.Split('?')[0]
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Where(segment => !segment.StartsWith('{') && !KebabCase().IsMatch(segment))
                .Select(segment => $"{description.HttpMethod} {path}: segment '{segment}'"));

            violations.AddRange(description.ParameterDescriptions
                .Where(p => p.Source == BindingSource.Query && !KebabCase().IsMatch(p.Name))
                .Select(p => $"{description.HttpMethod} {path}: query parameter '{p.Name}'"));
        }

        violations.ShouldBeEmpty();
    }

    [Fact]
    public async Task Every_api_route_is_versioned()
    {
        using var client = factory.CreateClient();
        var document = await client.GetFromJsonAsync<JsonElement>(
            new Uri("/openapi/v1.json", UriKind.Relative),
            TestContext.Current.CancellationToken);

        var paths = document.GetProperty("paths").EnumerateObject().Select(p => p.Name).ToList();

        paths.ShouldNotBeEmpty();
        paths.ShouldAllBe(path => path.StartsWith("/api/v1/"));
    }

    [Fact]
    public async Task Unknown_api_route_returns_problem_details_not_the_spa()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync(
            new Uri("/api/v1/does-not-exist", UriKind.Relative),
            TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await response.ReadProblemCodeAsync()).ShouldBe("http.endpoint.not-found");
    }

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex KebabCase();
}
