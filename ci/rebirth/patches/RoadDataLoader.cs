using System.Text.Json;
using Godot;
using ProjectRebirth.Data;

namespace ProjectRebirth.World;

public static class RoadDataLoader
{
    public sealed class RootDto
    {
        public int Schema { get; set; }
        public string Region { get; set; } = "";
        public string GeometryQuality { get; set; } = "";
        public List<RoadDto> Roads { get; set; } = new();
    }

    public sealed class RoadDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Class { get; set; } = "";
        public List<long> SourceRelations { get; set; } = new();
        public int Lanes { get; set; } = 2;
        public double DesignKph { get; set; } = 90;
        public List<double[]> Points { get; set; } = new();
    }

    static readonly JsonSerializerOptions Opt = new() { PropertyNameCaseInsensitive = true };

    public static List<Road> Load(string path = "res://Assets/Data/real_roads_start_region.json")
    {
        using var f = Godot.FileAccess.Open(path, Godot.FileAccess.ModeFlags.Read);
        if (f == null) throw new InvalidOperationException($"Road data not found: {path}");
        string json = f.GetAsText();
        var root = JsonSerializer.Deserialize<RootDto>(json, Opt)
            ?? throw new InvalidOperationException("Invalid road data JSON");

        var roads = new List<Road>();
        foreach (var r in root.Roads)
        {
            var anchors = r.Points
                .Where(p => p.Length >= 2)
                .Select(p => WorldData.ToWorld(p[0], p[1]))
                .ToList();
            if (anchors.Count < 2) continue;

            roads.Add(new Road
            {
                Id = r.Id,
                Name = r.Name,
                Class = r.Class,
                Lanes = r.Lanes,
                DesignKph = r.DesignKph,
                SourceRelations = r.SourceRelations,
                AnchorPoints = anchors,
                Points = RoadGeometry.Densify(anchors)
            });
        }

        return roads;
    }
}
