import curses
import random

def draw_matrix_rain(stdscr):
    curses.start_color()
    curses.init_pair(1, curses.COLOR_GREEN, curses.COLOR_BLACK)
    stdscr.attron(curses.color_pair(1))
    curses.curs_set(0)  # Hide cursor
    stdscr.nodelay(1)  # Make getch non-blocking
    stdscr.timeout(80)  # Refresh every 80 milliseconds

    sh, sw = stdscr.getmaxyx()  # Screen height and width
    raindrops = [random.randint(1, sw-1) for _ in range(100)]

    while True:
        stdscr.clear()
        for i in range(len(raindrops)):
            char = random.choice(['0', '1'])
            x = raindrops[i]
            stdscr.addstr(0, x, char)

            # Move the raindrop down
            new_y = (0 + 1) % sh
            stdscr.addstr(new_y, x, char, curses.A_DIM)  # Dim the character as it falls down

            # Reset the raindrop to the top if it reaches the bottom
            if new_y == sh-1:
                raindrops[i] = random.randint(1, sw-1)
            else:
                raindrops[i] = x

        stdscr.refresh()

        # Break if 'q' is pressed
        if stdscr.getch() == ord('q'):
            break

curses.wrapper(draw_matrix_rain)
