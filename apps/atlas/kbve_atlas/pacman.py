import curses
import random


def main(stdscr):
    curses.curs_set(0)  # Hide the cursor
    stdscr.nodelay(1)  # Don't block I/O calls
    stdscr.timeout(100)  # Refresh every 100 milliseconds

    sh, sw = stdscr.getmaxyx()
    w = curses.newwin(sh, sw, 0, 0)
    w.keypad(1)

    # Simple maze layout: walls (#), dots (.), empty space ( )
    maze = [
        "###################",
        "#........#........#",
        "#.##.###.#.###.##.#",
        "#.................#",
        "#.##.#.#####.#.##.#",
        "#....#...#...#....#",
        "######.### ###.####",
        "     #.#     #.#   ",
        "######.# ### #.####",
        "#........#........#",
        "#.###### # ######.#",
        "#.................#",
        "###################",
    ]

    # Pac-Man's starting position
    pac_y, pac_x = 5, 9
    key = curses.KEY_RIGHT  # Initial direction

    # Draw the initial maze
    for y, line in enumerate(maze):
        for x, char in enumerate(line):
            w.addch(y, x, char)

    while True:
        next_key = w.getch()
        key = next_key if next_key != -1 else key

        if key == curses.KEY_DOWN and maze[pac_y + 1][pac_x] != "#":
            pac_y += 1
        elif key == curses.KEY_UP and maze[pac_y - 1][pac_x] != "#":
            pac_y -= 1
        elif key == curses.KEY_LEFT and maze[pac_y][pac_x - 1] != "#":
            pac_x -= 1
        elif key == curses.KEY_RIGHT and maze[pac_y][pac_x + 1] != "#":
            pac_x += 1

        # Collect dots
        if maze[pac_y][pac_x] == ".":
            maze[pac_y] = maze[pac_y][:pac_x] + " " + maze[pac_y][pac_x + 1 :]

        # Redraw Pac-Man
        w.clear()
        for y, line in enumerate(maze):
            for x, char in enumerate(line):
                w.addch(y, x, char)
        w.addch(pac_y, pac_x, "C")  # Represent Pac-Man with 'C'
        w.refresh()

        # Check for game over (all dots collected)
        if all("." not in line for line in maze):
            break


curses.wrapper(main)
