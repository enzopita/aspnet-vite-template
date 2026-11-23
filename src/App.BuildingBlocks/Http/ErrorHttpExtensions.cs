using App.SharedKernel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;

namespace App.BuildingBlocks.Http;

/// <summary>Maps domain <see cref="Error"/>s to RFC 9457 Problem Details (ADR 0004).</summary>
public static class ErrorHttpExtensions
{
    /// <summary>Extension member carrying the stable machine-readable error code.</summary>
    public const string CodeExtension = "code";

    public static ProblemHttpResult ToProblem(this Error error)
    {
        ArgumentNullException.ThrowIfNull(error);

        return TypedResults.Problem(
            title: error.Message,
            statusCode: error.Kind.ToStatusCode(),
            extensions: new Dictionary<string, object?> { [CodeExtension] = error.Code });
    }

    public static int ToStatusCode(this ErrorKind kind) => kind switch
    {
        ErrorKind.Validation => StatusCodes.Status400BadRequest,
        ErrorKind.NotFound => StatusCodes.Status404NotFound,
        ErrorKind.Conflict => StatusCodes.Status409Conflict,
        ErrorKind.Unauthorized => StatusCodes.Status401Unauthorized,
        ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
        ErrorKind.Unexpected => StatusCodes.Status500InternalServerError,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };
}
