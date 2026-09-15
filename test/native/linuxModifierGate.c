#include <X11/Xlib.h>
#include <X11/extensions/XTest.h>
#include <X11/keysym.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* XTest keys are released when the client that pressed them disconnects, so the
 * fixture keeps its connection open while the helper reads the key state. */
static Display *display;
static char command[1024];

static void require(int condition, const char *message)
{
  if (condition) return;
  fprintf(stderr, "%s\n", message);
  exit(1);
}

static void set_key(KeySym keysym, Bool pressed)
{
  XTestFakeKeyEvent(display, XKeysymToKeycode(display, keysym), pressed, CurrentTime);
  XSync(display, False);
}

static FILE *start_wait(const char *helper, int timeout_ms)
{
  snprintf(command, sizeof(command), "'%s' --capabilities --await-modifier-release %d",
           helper, timeout_ms);
  FILE *output = popen(command, "r");
  require(output != NULL, "cannot start helper");
  return output;
}

static void finish_wait(FILE *output, const char *expected_state, int min_waited_ms,
                        int max_waited_ms)
{
  char state[32];
  int waited_ms = -1;
  int fields = fscanf(output, "MODIFIERS %31s %d", state, &waited_ms);
  require(pclose(output) == 0, "helper exited with an error");
  require(fields == 2, "helper did not report a modifier state");
  if (strcmp(state, expected_state) != 0 || waited_ms < min_waited_ms ||
      waited_ms > max_waited_ms) {
    fprintf(stderr, "expected %s after %d-%dms, got %s after %dms\n", expected_state,
            min_waited_ms, max_waited_ms, state, waited_ms);
    exit(1);
  }
}

int main(int argc, char **argv)
{
  require(argc == 2, "usage: linuxModifierGate <linux-fast-paste>");
  display = XOpenDisplay(NULL);
  require(display != NULL, "cannot open display");
  const char *helper = argv[1];

  finish_wait(start_wait(helper, 1000), "released", 0, 0);

  set_key(XK_Control_L, True);
  finish_wait(start_wait(helper, 100), "held", 100, 1000);

  FILE *output = start_wait(helper, 3000);
  usleep(200000);
  set_key(XK_Control_L, False);
  finish_wait(output, "released", 150, 1000);

  /* A locked Caps Lock is not a key being held. */
  set_key(XK_Caps_Lock, True);
  set_key(XK_Caps_Lock, False);
  finish_wait(start_wait(helper, 1000), "released", 0, 0);
  set_key(XK_Caps_Lock, True);
  set_key(XK_Caps_Lock, False);

  XCloseDisplay(display);
  printf("modifier gate native checks passed\n");
  return 0;
}
