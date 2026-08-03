import unittest

from save_intel import extract_guilds


def wrap(value):
    return {"value": value}


FIXTURE = {
    "worldSaveData": wrap(
        {
            "GroupSaveDataMap": wrap(
                [
                    {
                        "key": "g-1",
                        "value": {
                            "GroupType": wrap(wrap("EPalGroupType::Guild")),
                            "RawData": wrap(
                                {
                                    "group_id": "g-1",
                                    "guild_name": "KBVE",
                                    "admin_player_uid": "u-1",
                                    "base_camp_level": 12,
                                    "base_ids": ["b-1"],
                                    "individual_character_handle_ids": [1, 2, 3],
                                    "players": [
                                        {
                                            "player_uid": "u-1",
                                            "player_info": {
                                                "player_name": "h0lybyte",
                                                "last_online_real_time": 638,
                                            },
                                        }
                                    ],
                                }
                            ),
                        },
                    },
                    {
                        "key": "g-2",
                        "value": {
                            "GroupType": wrap(wrap("EPalGroupType::Organization")),
                            "RawData": wrap({"group_id": "g-2"}),
                        },
                    },
                ]
            ),
            "BaseCampSaveData": wrap(
                [
                    {
                        "key": "b-1",
                        "value": {
                            "RawData": wrap(
                                {
                                    "id": "b-1",
                                    "name": "",
                                    "group_id_belong_to": "g-1",
                                    "transform": {
                                        "translation": {
                                            "x": -92930.7,
                                            "y": 17885.2,
                                            "z": 5000.0,
                                        }
                                    },
                                }
                            )
                        },
                    },
                    {
                        "key": "b-2",
                        "value": {
                            "RawData": wrap(
                                {
                                    "id": "b-2",
                                    "group_id_belong_to": "g-1",
                                    "transform": {
                                        "translation": {"x": 1.0, "y": 2.0, "z": 3.0}
                                    },
                                }
                            )
                        },
                    },
                ]
            ),
        }
    )
}


class ExtractGuildsTest(unittest.TestCase):
    def test_extracts_guild_only(self):
        guilds = extract_guilds(FIXTURE)
        self.assertEqual(len(guilds), 1)
        self.assertEqual(guilds[0]["name"], "KBVE")
        self.assertEqual(guilds[0]["admin_uid"], "u-1")
        self.assertEqual(guilds[0]["pal_handles"], 3)

    def test_joins_bases_by_id_and_group(self):
        guilds = extract_guilds(FIXTURE)
        bases = guilds[0]["bases"]
        self.assertEqual([b["id"] for b in bases], ["b-1", "b-2"])
        self.assertAlmostEqual(bases[0]["x"], -92930.7)
        self.assertAlmostEqual(bases[0]["y"], 17885.2)

    def test_players_roster(self):
        guilds = extract_guilds(FIXTURE)
        players = guilds[0]["players"]
        self.assertEqual(players, [
            {"uid": "u-1", "name": "h0lybyte", "last_online": 638},
        ])

    def test_empty_world(self):
        self.assertEqual(extract_guilds({}), [])


if __name__ == "__main__":
    unittest.main()
