import os
import random
import time

# Constants
BOARD_WIDTH = 10
BOARD_HEIGHT = 20
SHAPES = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 1, 1], [0, 1, 0]],
    [[1, 1, 1], [0, 0, 1]],
    [[1, 1, 1], [1, 0, 0]]
]

# Game state
board = [[0] * BOARD_WIDTH for _ in range(BOARD_HEIGHT)]
current_shape = None
current_pos = None

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def draw_board():
    for row in board:
        print('|' + ''.join(['#' if cell else ' ' for cell in row]) + '|')
    print('+' + '-' * BOARD_WIDTH + '+')

def spawn_shape():
    global current_shape, current_pos
    current_shape = random.choice(SHAPES)
    current_pos = (0, BOARD_WIDTH // 2 - len(current_shape[0]) // 2)

def can_move(shape, pos):
    for i, row in enumerate(shape):
        for j, cell in enumerate(row):
            if cell:
                x, y = pos[0] + i, pos[1] + j
                if x < 0 or x >= BOARD_HEIGHT or y < 0 or y >= BOARD_WIDTH or board[x][y]:
                    return False
    return True

def place_shape():
    for i, row in enumerate(current_shape):
        for j, cell in enumerate(row):
            if cell:
                x, y = current_pos[0] + i, current_pos[1] + j
                board[x][y] = 1

def clear_lines():
    global board
    lines_cleared = 0
    new_board = []
    for row in board:
        if 0 not in row:
            lines_cleared += 1
        else:
            new_board.append(row)
    board = [[0] * BOARD_WIDTH for _ in range(BOARD_HEIGHT - len(new_board))] + new_board
    return lines_cleared

def game_loop():
    spawn_shape()
    while True:
        clear_screen()
        draw_board()
        time.sleep(0.5)
        new_pos = (current_pos[0] + 1, current_pos[1])
        if can_move(current_shape, new_pos):
            current_pos = new_pos
        else:
            place_shape()
            lines_cleared = clear_lines()
            if lines_cleared:
                print(f"Lines cleared: {lines_cleared}")
            if any(board[0]):
                print("Game Over!")
                break
            spawn_shape()

if __name__ == '__main__':
    game_loop()