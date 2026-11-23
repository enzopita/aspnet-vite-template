using System.Text.Json;

namespace App.Api.IntegrationTests.Support;

/// <summary>Reads RFC 9457 Problem Details responses.</summary>
internal static class ProblemResponses
{
    /// <summary>Asserts the response is <c>application/problem+json</c> and returns its stable <c>code</c>.</summary>
    public static async Task<string?> ReadProblemCodeAsync(this HttpResponseMessage response)
    {
        response.Content.Headers.ContentType.ShouldNotBeNull().MediaType.ShouldBe("application/problem+json");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        return problem.GetProperty("code").GetString();
    }
}
