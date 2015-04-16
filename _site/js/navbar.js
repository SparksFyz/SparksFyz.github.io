function sleep(sleepTime) {
  for (var start = Date.now(); Date.now() - start <= sleepTime;) {}
}

$(document).ready(function() {

  $("#nothing").mouseover(function() {
    $(this).popover("show");
  });
  $("#nothing").mouseleave(function() {
    $(this).popover("hide");
  });
}); 

function scroTop(){
    document.body.scrollTop = document.documentElement.scrollTop = 0;
}