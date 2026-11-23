using Microsoft.OpenApi;

namespace App.Api.IntegrationTests.Conventions;

/// <summary>
/// The OpenAPI document is the contract for the TS client (ADR 0007), so it is validated
/// here with Microsoft.OpenApi — the library ASP.NET Core itself uses, which supports the 3.2 spec we publish.
/// (Kubb's bundled validator doesn't read 3.2 yet, so its validation is disabled in web/kubb.config.ts.)
/// </summary>
public sealed class OpenApiDocumentTests(AppApiFactory factory)
{
    [Fact]
    public async Task Published_document_is_valid_openapi_3_2()
    {
        using var client = factory.CreateClient();
        await using var stream = await client.GetStreamAsync(
            new Uri("/openapi/v1.json", UriKind.Relative),
            TestContext.Current.CancellationToken);

        var result = await OpenApiDocument.LoadAsync(stream, "json", cancellationToken: TestContext.Current.CancellationToken);

        result.Diagnostic.ShouldNotBeNull();
        result.Diagnostic.SpecificationVersion.ShouldBe(OpenApiSpecVersion.OpenApi3_2);
        result.Diagnostic.Errors.ShouldBeEmpty();

        result.Document.ShouldNotBeNull();
        result.Document.Validate(ValidationRuleSet.GetDefaultRuleSet()).ShouldBeEmpty();
    }

    [Fact]
    public async Task Every_operation_has_an_id_and_summary()
    {
        using var client = factory.CreateClient();
        await using var stream = await client.GetStreamAsync(
            new Uri("/openapi/v1.json", UriKind.Relative),
            TestContext.Current.CancellationToken);
        var document = (await OpenApiDocument.LoadAsync(stream, "json", cancellationToken: TestContext.Current.CancellationToken)).Document;

        document.ShouldNotBeNull();
        var operations = document.Paths
            .SelectMany(path => path.Value.Operations ?? [])
            .ToList();

        operations.ShouldNotBeEmpty();
        operations.ShouldAllBe(op => !string.IsNullOrWhiteSpace(op.Value.OperationId));
        operations.ShouldAllBe(op => !string.IsNullOrWhiteSpace(op.Value.Summary));
    }
}
