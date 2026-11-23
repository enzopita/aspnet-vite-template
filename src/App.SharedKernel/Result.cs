using System.Diagnostics.CodeAnalysis;

namespace App.SharedKernel;

/// <summary>Outcome of an operation that returns no value.</summary>
public readonly record struct Result
{
    private Result(Error? error) => Error = error;

    public Error? Error { get; }

    [MemberNotNullWhen(false, nameof(Error))]
    public bool IsSuccess => Error is null;

    public static Result Success() => new(null);

    public static Result Failure(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result(error);
    }

    public static implicit operator Result(Error error) => Failure(error);
}

/// <summary>Outcome of an operation that returns a <typeparamref name="T"/> on success.</summary>
public readonly record struct Result<T>
{
    private Result(T? value, Error? error)
    {
        Value = value;
        Error = error;
    }

    public Error? Error { get; }

    [MemberNotNullWhen(false, nameof(Error))]
    public bool IsSuccess => Error is null;

    /// <summary>The value; throws when the result is a failure.</summary>
    [AllowNull]
    [field: MaybeNull]
    public T Value
    {
        get => IsSuccess
            ? field
            : throw new InvalidOperationException($"Cannot read the value of a failed result ({Error.Code}).");
        private init;
    }

    public static Result<T> Success(T value) => new(value, null);

    public static Result<T> Failure(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result<T>(default, error);
    }

    public static implicit operator Result<T>(T value) => Success(value);

    public static implicit operator Result<T>(Error error) => Failure(error);
}
