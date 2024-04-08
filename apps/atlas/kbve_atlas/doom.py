import curses

def main(stdscr):
    curses.curs_set(0)  # Hide the cursor
    stdscr.nodelay(1)  # Make getch non-blocking
    stdscr.timeout(100)  # Refresh the screen every 100 milliseconds

    max_y, max_x = stdscr.getmaxyx()
    position = 0  # Player's position in the hallway

    while True:
        stdscr.clear()

        # Handle input
        key = stdscr.getch()
        if key == curses.KEY_LEFT or key == ord('a'):
            position = max(0, position - 1)
        elif key == curses.KEY_RIGHT or key == ord('d'):
            position = position + 1

        # Draw the hallway
        hallway_visual = generate_hallway_view(position, max_x)
        for i, line in enumerate(hallway_visual):
            stdscr.addstr(i, 0, line)

        stdscr.refresh()

def generate_hallway_view(position, width):
    """Generate a pseudo-3D hallway view based on the position."""
    view = []
    wall_char = '#'
    path_char = ' '

    for i in range(10):  # 10 lines of hallway depth
        line = ''
        wall_width = max(1, (i - position) * 2)  # Increase wall size with depth and position
        path_width = width - (2 * wall_width)  # Calculate path width
        if path_width < 1:
            # The player is too far back, fill line with walls
            line = wall_char * width
        else:
            line = (wall_char * wall_width) + (path_char * path_width) + (wall_char * wall_width)
        view.append(line)

    return view

curses.wrapper(main)
