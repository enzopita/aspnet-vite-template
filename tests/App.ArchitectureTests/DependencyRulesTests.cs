using System.Text.RegularExpressions;
using ArchUnitNET.xUnitV3;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace App.ArchitectureTests;

/// <summary>Enforces ADR 0003. When a rule blocks legitimate work, write an ADR — don't weaken the test.</summary>
public sealed partial class DependencyRulesTests
{
    private const string Frameworks = @"Microsoft\.(AspNetCore|EntityFrameworkCore)";
    private const string AnySubNamespace = @"(\..+)?$";

    private static readonly ArchUnitNET.Domain.Architecture Architecture = AppArchitecture.Architecture;

    [Fact]
    public void SharedKernel_depends_on_the_bcl_only() =>
        Types().That().ResideInAssembly(AppArchitecture.SharedKernel)
            .Should().NotDependOnAnyTypesThat()
            .ResideInNamespaceMatching($@"^(App\.(?!SharedKernel)\w+|{Frameworks}){AnySubNamespace}")
            .Because("the shared kernel holds pure domain primitives")
            .Check(Architecture);

    [Fact]
    public void Domain_does_not_depend_on_infrastructure_or_features() =>
        Types().That().ResideInNamespaceMatching($@"^App\.\w+\.Domain{AnySubNamespace}")
            .Should().NotDependOnAnyTypesThat()
            .ResideInNamespaceMatching(
                $@"^({Frameworks}|App\.BuildingBlocks|App\.\w+\.(Persistence|Features)){AnySubNamespace}")
            .Because("domain models must stay persistence- and transport-agnostic")
            .Check(Architecture);

    [Fact]
    public void Persistence_does_not_depend_on_features() =>
        Types().That().ResideInNamespaceMatching($@"^App\.\w+\.Persistence{AnySubNamespace}")
            .Should().NotDependOnAnyTypesThat()
            .ResideInNamespaceMatching($@"^App\.\w+\.Features{AnySubNamespace}")
            .Check(Architecture);

    [Fact]
    public void Contracts_do_not_depend_on_implementations() =>
        Types().That().ResideInAssembly(AppArchitecture.Contracts[0], [.. AppArchitecture.Contracts.Skip(1)])
            .Should().NotDependOnAnyTypesThat()
            .ResideInNamespaceMatching(
                $@"^({Frameworks}|App\.BuildingBlocks|App\.\w+\.(Domain|Persistence|Features)){AnySubNamespace}")
            .Because("contracts are the stable public surface other modules compile against")
            .Check(Architecture);

    [Fact]
    public void Modules_expose_only_their_composition_entry_point() =>
        Types().That().ResideInAssembly(AppArchitecture.Modules[0], [.. AppArchitecture.Modules.Skip(1)])
            .And().ArePublic()
            .And().DoNotResideInNamespaceMatching($@"^App\.\w+\.Persistence\.Migrations$")
            .Should().HaveNameEndingWith("Module")
            .Because("module internals are reachable only through <Module>.Contracts (ADR 0002)")
            .WithoutRequiringPositiveResults()
            .Check(Architecture);

    [Fact]
    public void Slices_do_not_depend_on_other_slices()
    {
        var slices = Architecture.Namespaces
            .Select(ns => ns.FullName)
            .Where(ns => SliceNamespace().IsMatch(ns))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        foreach (var slice in slices)
        {
            var others = slices.Where(s => s != slice).Select(Regex.Escape).ToList();
            if (others.Count == 0)
            {
                continue;
            }

            Types().That().ResideInNamespace(slice)
                .Should().NotDependOnAnyTypesThat()
                .ResideInNamespaceMatching($"^({string.Join('|', others)}){AnySubNamespace}")
                .Because("each use case is an independent vertical slice (ADR 0002)")
                .Check(Architecture);
        }
    }

    [GeneratedRegex(@"^App\.\w+\.Features\.\w+\.\w+$")]
    private static partial Regex SliceNamespace();
}
