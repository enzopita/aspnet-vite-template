using App.SharedKernel;

namespace App.Catalog.Domain;

internal static class CatalogErrors
{
    public static readonly Error SkuRequired = Error.Validation(
        "catalog.product.sku-required",
        "Product SKU is required.");

    public static readonly Error SkuTooLong = Error.Validation(
        "catalog.product.sku-too-long",
        "Product SKU must be 64 characters or fewer.");

    public static readonly Error NameRequired = Error.Validation(
        "catalog.product.name-required",
        "Product name is required.");

    public static readonly Error NameTooLong = Error.Validation(
        "catalog.product.name-too-long",
        "Product name must be 200 characters or fewer.");

    public static readonly Error InvalidPrice = Error.Validation(
        "catalog.product.invalid-price",
        "Product price cannot be negative.");

    public static readonly Error InvalidStock = Error.Validation(
        "catalog.product.invalid-stock",
        "Initial stock quantity cannot be negative.");

    public static readonly Error InvalidAdjustment = Error.Validation(
        "catalog.product.invalid-adjustment",
        "Stock adjustment delta must be non-zero.");

    public static readonly Error InvalidPagination = Error.Validation(
        "catalog.product.invalid-pagination",
        "Pagination parameters are out of range.");

    public static readonly Error SkuTaken = Error.Conflict(
        "catalog.product.sku-taken",
        "A product with this SKU already exists.");

    public static readonly Error NotFound = Error.NotFound(
        "catalog.product.not-found",
        "Product was not found.");

    public static readonly Error InsufficientStock = Error.Conflict(
        "catalog.product.insufficient-stock",
        "Product does not have enough stock.");

    public static readonly Error ConcurrencyConflict = Error.Conflict(
        "catalog.product.concurrency-conflict",
        "Product was modified concurrently. Please retry.");
}
