using Godot;

namespace ProjectRebirth.Gameplay;

public sealed class PlayerState
{
    public Vector2 Position { get; set; }
    public Vector2 PreviousPosition { get; set; }
    public float Angle { get; set; } = -MathF.PI / 2;
    public double SpeedKph { get; set; }
    public Vector2? Destination { get; set; }
    public List<Vector2> Route { get; set; } = new();
    public int RouteIndex { get; set; }
    public string RouteMode { get; set; } = "road-network";

    public double Health { get; set; } = 200;
    public double MaxHealth { get; set; } = 200;
    public double Fuel { get; set; } = 52;
    public double MaxFuel { get; set; } = 70;

    public int Cash { get; set; } = 2500;
    public int AmmoMag { get; set; } = 12;
    public int AmmoMag2 { get; set; } = 12;
    public int AmmoReserve { get; set; } = 72;
    public int ActivePistol { get; set; }
    public int Kills { get; set; }

    public double ReloadUntil { get; set; }
    public double LastShotAt { get; set; } = -99;

    public string WeaponMode { get; set; } = "manual";
    public string Surface { get; set; } = "asphalt";
    public string Tires { get; set; } = "street";
    public string LastCity { get; set; } = "phoenix";

    public Dictionary<string, int> Inventory { get; set; } = new()
    {
        ["water"] = 2,
        ["food"] = 2,
        ["medicine"] = 0,
        ["parts"] = 0,
        ["tools"] = 0,
        ["battery"] = 0,
        ["electronics"] = 0,
        ["scrap"] = 0
    };
}

public sealed class NpcState
{
    public string Id { get; set; } = "";
    public string Faction { get; set; } = "";
    public string Role { get; set; } = "";
    public string Mission { get; set; } = "roam";

    public Vector2 Position { get; set; }
    public Vector2 PreviousPosition { get; set; }
    public float Angle { get; set; }
    public double SpeedKph { get; set; }

    public Vector2? Destination { get; set; }
    public List<Vector2> Route { get; set; } = new();
    public int RouteIndex { get; set; }
    public string RouteMode { get; set; } = "direct";

    public double Health { get; set; } = 100;
    public double MaxHealth { get; set; } = 100;
    public double LastShotAt { get; set; } = -99;
    public double RespawnAt { get; set; }
    public double RouteReplanAt { get; set; }

    public bool Dead { get; set; }
    public bool IsMercenary { get; set; }

    public string? Home { get; set; }
    public string? LastCity { get; set; }
    public string? EscortTargetId { get; set; }
    public string? LootTargetId { get; set; }
    public string? EngagedTargetId { get; set; }

    public int LootCash { get; set; }
    public int LootAmmo { get; set; }
    public double LootFuel { get; set; }
    public Dictionary<string, int> LootItems { get; set; } = new();
}

public sealed class BulletState
{
    public string OwnerId { get; set; } = "";
    public bool OwnerIsPlayer { get; set; }
    public string Faction { get; set; } = "";
    public Vector2 Position { get; set; }
    public Vector2 Velocity { get; set; }
    public int Damage { get; set; }
    public double Life { get; set; }
    public double RelativeDistance { get; set; }
    public double MaxRange { get; set; }
}

public sealed class WreckState
{
    public string Id { get; set; } = "";
    public Vector2 Position { get; set; }
    public float Angle { get; set; }
    public string Faction { get; set; } = "";
    public string Role { get; set; } = "";
    public double CreatedAt { get; set; }
    public double ExpiresAt { get; set; }
    public string? KillerNpcId { get; set; }
    public int Cash { get; set; }
    public int Ammo { get; set; }
    public double Fuel { get; set; }
    public Dictionary<string, int> Items { get; set; } = new();
}
