export function getScore(){
  // get score from local storage and if it doesn't exist, return 0
  return parseInt(localStorage.getItem('score') || '0');
}

export function incrementScore(){
  const score = getScore() + 1;
  localStorage.setItem('score', score.toString());
}

export function resetScore(){
  localStorage.setItem('score', '0');
}
