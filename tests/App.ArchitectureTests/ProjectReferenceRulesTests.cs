using System.Xml.Linq;

namespace App.ArchitectureTests;

/// <summary>
/// Enforces the project-level half of ADR 0003 by reading the .csproj files: a module may reference only the shared
/// kernel, the building blocks and other modules' Contracts — never another module's implementation.
/// </summary>
public sealed class ProjectReferenceRulesTests
{
    private static readonly DirectoryInfo RepositoryRoot = FindRepositoryRoot();

    public static TheoryData<string> ModuleProjects()
    {
        var data = new TheoryData<string>();
        foreach (var project in Directory.EnumerateFiles(
                     Path.Combine(RepositoryRoot.FullName, "src", "Modules"), "*.csproj", SearchOption.AllDirectories))
        {
            data.Add(Path.GetRelativePath(RepositoryRoot.FullName, project));
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(ModuleProjects))]
    public void Modules_reference_only_kernel_building_blocks_and_contracts(string project)
    {
        var isContracts = Path.GetFileNameWithoutExtension(project).EndsWith(".Contracts", StringComparison.Ordinal);

        var violations = ReferencedProjects(project)
            .Where(reference => !IsAllowed(reference, isContracts))
            .ToList();

        violations.ShouldBeEmpty(
            isContracts
                ? "Contracts may reference only App.SharedKernel and other modules' Contracts (ADR 0003)."
                : "Modules may reference only App.SharedKernel, App.BuildingBlocks and *.Contracts (ADR 0003).");
    }

    [Fact]
    public void SharedKernel_references_no_projects() =>
        ReferencedProjects(Path.Combine("src", "App.SharedKernel", "App.SharedKernel.csproj")).ShouldBeEmpty();

    [Fact]
    public void SharedKernel_references_no_packages() =>
        XDocument.Load(Path.Combine(RepositoryRoot.FullName, "src", "App.SharedKernel", "App.SharedKernel.csproj"))
            .Descendants()
            .Where(e => e.Name.LocalName is "PackageReference" or "FrameworkReference")
            .ShouldBeEmpty("the shared kernel depends on the BCL only (ADR 0003)");

    private static bool IsAllowed(string referencedProject, bool fromContracts)
    {
        var name = Path.GetFileNameWithoutExtension(referencedProject);
        return name == "App.SharedKernel"
            || name.EndsWith(".Contracts", StringComparison.Ordinal)
            || (!fromContracts && name == "App.BuildingBlocks");
    }

    private static List<string> ReferencedProjects(string relativeProjectPath)
    {
        var path = Path.Combine(RepositoryRoot.FullName, relativeProjectPath);
        var references = XDocument.Load(path)
            .Descendants()
            .Where(e => e.Name.LocalName == "ProjectReference")
            // MSBuild paths use '\'; normalize so file names resolve on Linux CI too.
            .Select(e => (e.Attribute("Include")?.Value ?? string.Empty).Replace('\\', '/'));
        return [.. references];
    }

    private static DirectoryInfo FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "App.slnx")))
        {
            directory = directory.Parent;
        }

        return directory ?? throw new InvalidOperationException("Could not locate App.slnx above the test binaries.");
    }
}
