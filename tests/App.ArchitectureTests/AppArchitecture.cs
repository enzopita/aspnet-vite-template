using ArchUnitNET.Loader;
using Architecture = ArchUnitNET.Domain.Architecture;
using Assembly = System.Reflection.Assembly;

namespace App.ArchitectureTests;

/// <summary>
/// Loads every <c>App.*</c> assembly reachable from the API host, so new modules are covered automatically.
/// </summary>
internal static class AppArchitecture
{
    private static readonly string[] InfrastructureAssemblies =
    [
        "App.Api",
        "App.SharedKernel",
        "App.BuildingBlocks",
        "App.ServiceDefaults",
    ];

    public static readonly IReadOnlyList<Assembly> All = DiscoverAppAssemblies(typeof(Program).Assembly);

    public static readonly Assembly SharedKernel = All.Single(a => a.GetName().Name == "App.SharedKernel");

    /// <summary><c>App.&lt;Module&gt;.Contracts</c> assemblies — the public surface of each module.</summary>
    public static readonly IReadOnlyList<Assembly> Contracts =
        [.. All.Where(a => a.GetName().Name!.EndsWith(".Contracts", StringComparison.Ordinal))];

    /// <summary><c>App.&lt;Module&gt;</c> implementation assemblies.</summary>
    public static readonly IReadOnlyList<Assembly> Modules =
        [.. All.Where(a => !InfrastructureAssemblies.Contains(a.GetName().Name) && !Contracts.Contains(a))];

    public static readonly Architecture Architecture = new ArchLoader().LoadAssemblies([.. All]).Build();

    private static List<Assembly> DiscoverAppAssemblies(Assembly root)
    {
        var found = new Dictionary<string, Assembly>(StringComparer.Ordinal);
        var pending = new Stack<Assembly>([root]);

        while (pending.TryPop(out var assembly))
        {
            if (!found.TryAdd(assembly.GetName().Name!, assembly))
            {
                continue;
            }

            foreach (var reference in assembly.GetReferencedAssemblies())
            {
                if (reference.Name?.StartsWith("App.", StringComparison.Ordinal) == true
                    && !found.ContainsKey(reference.Name))
                {
                    pending.Push(Assembly.Load(reference));
                }
            }
        }

        return [.. found.Values];
    }
}
