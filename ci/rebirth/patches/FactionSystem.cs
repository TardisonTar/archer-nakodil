using ProjectRebirth.Data;

namespace ProjectRebirth.Gameplay;

public sealed class FactionSystem
{
    public sealed class Org
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
        public string Capital { get; set; } = "";
        public int Members { get; set; } = 1;
    }

    public Dictionary<string, Org> Unions { get; set; } = new();
    public Dictionary<string, Org> Clans { get; set; } = new();
    public Dictionary<string, string> CityAffiliation { get; set; } = new();
    public Dictionary<string, int> Relations { get; set; } = new();
    public Dictionary<string, int> PlayerReputation { get; set; } = new();
    public string? PlayerClanId { get; set; }
    public bool OverlayEnabled { get; set; } = true;

    public FactionSystem() => Reset();

    public void Reset()
    {
        Unions = new()
        {
            ["union_phoenix"] = new() { Id = "union_phoenix", Type = "cityUnion", Name = "Союз городов Финикса", Capital = "phoenix" },
            ["union_north"] = new() { Id = "union_north", Type = "cityUnion", Name = "Северный союз городов", Capital = "prescott" },
            ["union_west"] = new() { Id = "union_west", Type = "cityUnion", Name = "Западный союз городов", Capital = "wickenburg" }
        };

        CityAffiliation = new()
        {
            ["phoenix"] = "union_phoenix",
            ["prescott"] = "union_north",
            ["wickenburg"] = "union_west"
        };

        Relations = new()
        {
            [Key("union_phoenix", "union_north")] = 20,
            [Key("union_phoenix", "union_west")] = 10,
            [Key("union_north", "union_west")] = 5
        };

        PlayerReputation = Unions.Keys.ToDictionary(k => k, _ => 0);
        Clans = new();
        PlayerClanId = null;
        OverlayEnabled = true;
    }

    private static string Key(string a, string b) =>
        string.CompareOrdinal(a, b) < 0 ? $"{a}|{b}" : $"{b}|{a}";

    public int GetRelation(string a, string b) =>
        a == b ? 100 : Relations.GetValueOrDefault(Key(a, b));

    public void SetRelation(string a, string b, int value)
    {
        if (a == b) return;
        Relations[Key(a, b)] = Math.Clamp(value, -100, 100);
    }

    public Org? CreateClan(string id, string name, string? homeCity = null)
    {
        var cid = id.Trim().ToLowerInvariant().Replace(' ', '-');
        if (!cid.StartsWith("clan_")) cid = "clan_" + cid;
        if (Clans.ContainsKey(cid)) return null;

        var clan = new Org
        {
            Id = cid,
            Type = "clan",
            Name = string.IsNullOrWhiteSpace(name) ? cid : name,
            Capital = homeCity ?? ""
        };
        Clans[cid] = clan;
        PlayerReputation[cid] = 0;
        return clan;
    }

    public bool JoinClan(string id)
    {
        if (!Clans.ContainsKey(id)) return false;
        PlayerClanId = id;
        return true;
    }

    public void LeaveClan() => PlayerClanId = null;

    public bool ClaimCity(string cityId, string clanId)
    {
        if (!Clans.ContainsKey(clanId) || !WorldData.Cities.Any(c => c.Id == cityId)) return false;
        CityAffiliation[cityId] = clanId;
        return true;
    }
}
