using Godot;
using System.Text.Json.Serialization;

namespace ProjectRebirth.Data;

public sealed class City
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Ru { get; set; } = "";
    public string Faction { get; set; } = "";
    public double Lon { get; set; }
    public double Lat { get; set; }
    public double RadiusKm { get; set; }
    [JsonIgnore] public Vector2 Position { get; set; }
}

public sealed class Road
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Class { get; set; } = "";
    public int Lanes { get; set; } = 2;
    public double DesignKph { get; set; } = 90;
    public List<long> SourceRelations { get; set; } = new();
    public List<Vector2> AnchorPoints { get; set; } = new();
    public List<Vector2> Points { get; set; } = new();
}

public sealed class ItemDef
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public double BasePrice { get; init; }
    public double WeightKg { get; init; }
    public bool Cargo { get; init; }
}

public sealed class RoutePlan
{
    public string Mode { get; set; } = "direct";
    public List<Vector2> Points { get; set; } = new();
    public double DistanceKm { get; set; }
    public double TimeHours { get; set; }
}
