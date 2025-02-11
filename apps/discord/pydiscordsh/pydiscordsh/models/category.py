from typing import List, Tuple

class DiscordCategories:
    # In-memory categories with their "active" status, each category will now have an index
    CATEGORIES = {
        0: {"category": "Anime", "active": True},
        1: {"category": "Art", "active": True},
        2: {"category": "Community", "active": True},
        3: {"category": "Cooking", "active": True},
        4: {"category": "Design", "active": True},
        5: {"category": "Education", "active": True},
        6: {"category": "Entertainment", "active": True},
        7: {"category": "eSports", "active": True},
        8: {"category": "Fitness", "active": True},
        9: {"category": "Gaming", "active": True},
        10: {"category": "Health", "active": True},
        11: {"category": "Hobbies", "active": True},
        12: {"category": "Memes", "active": True},
        13: {"category": "Music", "active": True},
        14: {"category": "PC", "active": True},
        15: {"category": "Photography", "active": True},
        16: {"category": "Programming", "active": True},
        17: {"category": "RolePlaying", "active": True},
        18: {"category": "Social", "active": True},
        19: {"category": "Sports", "active": True}
    }

    @classmethod
    def is_valid_category(cls, index: int) -> bool:
        """
        Check if the category with the given index is valid and active.
        Args:
            index (int): The index of the category to check.
        Returns:
            bool: True if the category exists and is active, False otherwise.
        Example:
            >>> DiscordCategories.is_valid_category(9)
            True
            >>> DiscordCategories.is_valid_category(100)
            False
        """
        category = cls.CATEGORIES.get(index)
        return category is not None and category["active"]
    
    @classmethod
    def set_category_active(cls, index: int, active: bool):
        """
        Set the 'active' status for a specific category by its index.
        Args:
            index (int): The index of the category to modify.
            active (bool): The active status to set (True or False).
        Example:
            >>> DiscordCategories.set_category_active(9, False)
            >>> DiscordCategories.is_valid_category(9)
            False
        """
        category = cls.CATEGORIES.get(index)
        if category:
            category["active"] = active
        else:
            raise ValueError(f"Category with index {index} does not exist.")
    
    @classmethod
    def get_all_active_categories(cls) -> List[dict]:
        """
        Get a list of all active categories with their index and name.
        
        Returns:
            List[dict]: A list of dictionaries, each containing the index and name of an active category.
            
        Example:
            >>> DiscordCategories.get_all_active_categories()
            [
                {"index": 0, "name": "Anime"},
                {"index": 1, "name": "Art"},
                {"index": 2, "name": "Community"},
                {"index": 3, "name": "Cooking"},
                ...
            ]
        """
        return [{"index": index, "name": category["category"]} for index, category in cls.CATEGORIES.items() if category["active"]]

    
    @classmethod
    def get_all_categories(cls) -> List[Tuple[int, str]]:
        """
        Get a list of all categories by index, active or not.
        Returns:
            List[Tuple[int, str]]: A list of tuples containing index and category names, regardless of active status.
        Example:
            >>> DiscordCategories.get_all_categories()
            [(0, 'Anime'), (1, 'Art'), (2, 'Community'), ...]
        """
        return [(index, cls.CATEGORIES[index]["category"]) for index in cls.CATEGORIES]