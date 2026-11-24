// Step 21B: globals declared in code. Every file of the app sees them.
var visitor = 'guest';

function likeLabel() {
  return likes === 1 ? '1 like' : likes + ' likes';
}

function like() {
  likes++;
}
