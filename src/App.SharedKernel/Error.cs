namespace App.SharedKernel;

/// <summary>Category of an <see cref="Error"/>; drives the HTTP status it maps to.</summary>
public enum ErrorKind
{
    Validation,
    NotFound,
    Conflict,
    Unauthorized,
    Forbidden,
    Unexpected,
}

/// <summary>
/// A business error. <see cref="Code"/> is stable and machine-readable
/// (<c>&lt;module&gt;.&lt;entity&gt;.&lt;reason&gt;</c>, e.g. <c>orders.order.out-of-stock</c>);
/// <see cref="Message"/> is a developer-facing fallback. User-facing text is localized from the code.
/// </summary>
public sealed record Error(string Code, string Message, ErrorKind Kind)
{
    public static Error Validation(string code, string message) => new(code, message, ErrorKind.Validation);

    public static Error NotFound(string code, string message) => new(code, message, ErrorKind.NotFound);

    public static Error Conflict(string code, string message) => new(code, message, ErrorKind.Conflict);

    public static Error Unauthorized(string code, string message) => new(code, message, ErrorKind.Unauthorized);

    public static Error Forbidden(string code, string message) => new(code, message, ErrorKind.Forbidden);

    public static Error Unexpected(string code, string message) => new(code, message, ErrorKind.Unexpected);
}
