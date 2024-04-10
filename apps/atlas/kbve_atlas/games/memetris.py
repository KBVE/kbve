import curses
import random
from collections import namedtuple

# Define the shapes of the tetrominoes
Shapes = [
    [[1, 1, 1, 1]],  # I
    [[1, 1, 1], [0, 1, 0]],  # T
    [[0, 1, 1], [1, 1, 0]],  # S
    [[1, 1, 0], [0, 1, 1]],  # Z
    [[1, 0, 0], [1, 1, 1]],  # J
    [[0, 0, 1], [1, 1, 1]],  # L
    [[1, 1], [1, 1]],  # O
]

# Named tuple for position
Position = namedtuple('Position', ['x', 'y'])

class Tetris:
    def __init__(self, height, width):
        self.height = height
        self.width = width
        self.board = [[0] * width for _ in range(height)]
        self.score = 0
        self.current_piece = None
        self.current_position = None
        self.next_piece = None

    def new_piece(self):
        self.current_piece = self.next_piece if self.next_piece else random.choice(Shapes)
        self.next_piece = random.choice(Shapes)
        self.current_position = Position(x=self.width // 2 - len(self.current_piece[0]) // 2, y=0)

        # Check if new piece can be placed, if not - game over
        if not self.valid_position(self.current_piece, self.current_position):
            self.game_over()

    def valid_position(self, shape, position):
        for y, row in enumerate(shape):
            for x, cell in enumerate(row):
                try:
                    if cell and self.board[y + position.y][x + position.x]:
                        return False
                except IndexError:
                    return False
        return True

    def game_over(self):
        curses.endwin()
        print(f"Game Over! Your score: {self.score}")
        quit()

    def rotate(self):
        # Rotate the piece (90 degrees clockwise)
        self.current_piece = [list(row) for row in zip(*self.current_piece[::-1])]

        if not self.valid_position(self.current_piece, self.current_position):
            # If the rotation is not possible, rotate back
            self.current_piece = [list(row) for row in zip(*self.current_piece)[::-1]]

    def move(self, dx):
        new_position = Position(x=self.current_position.x + dx, y=self.current_position.y)
        if self.valid_position(self.current_piece, new_position):
            self.current_position = new_position

    def drop(self):
        new_position = Position(x=self.current_position.x, y=self.current_position.y + 1)
        if self.valid_position(self.current_piece, new_position):
            self.current_position = new_position
        else:
            # Place piece on the board
            for y, row in enumerate(self.current_piece):
                for x, cell in enumerate(row):
                    if cell:
                        self.board[y + self.current_position.y][x + self.current_position.x] = 1
            self.new_piece()

    def clear_lines(self):
        # Clear completed lines
        self.board = [row for row in self.board if not all(row)]
        cleared_lines = self.height - len(self.board)
        self.score += cleared_lines
        self.board = [[0] * self.width for _ in range(cleared_lines)] + self.board

    def draw(self, stdscr):
        stdscr.clear()
        # Draw the border
        for y in range(self.height + 1):
            for x in range(self.width + 2):
                if x == 0 or x == self.width + 1 or y == self.height:
                    stdscr.addstr(y, x, "#")
                else:
                    stdscr.addstr(y, x, " ")
        
        # Draw the board within the border
        for y, row in enumerate(self.board):
            for x, cell in enumerate(row):
                if cell:
                    stdscr.addstr(y + 1, x + 1, "#")  # Adjusted to fit within the border
        
        # Draw the current piece within the border
        for y, row in enumerate(self.current_piece):
            for x, cell in enumerate(row):
                if cell:
                    stdscr.addstr(self.current_position.y + y + 1, self.current_position.x + x + 1, "#")  # Adjusted to fit within the border
        stdscr.refresh()

def main(stdscr):
    curses.curs_set(0)  # Hide the cursor
    stdscr.nodelay(1)  # Make getch non-blocking
    stdscr.timeout(100)  # Refresh rate

    game = Tetris(20, 10)
    game.new_piece()

    while True:
        key = stdscr.getch()

        if key == curses.KEY_UP:
            game.rotate()
        elif key == curses.KEY_LEFT:
            game.move(-1)
        elif key == curses.KEY_RIGHT:
            game.move(1)
        elif key == curses.KEY_DOWN:
            game.drop()

        game.drop()  # Automatic drop
        game.clear_lines()
        game.draw(stdscr)

if __name__ == "__main__":
    curses.wrapper(main)