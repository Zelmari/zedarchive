#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>

typedef int (*probe_fd_flags_reader)(int fd, int *observed_errno);
int fd_admission_probe_classify_for_test(long open_max,
                                         probe_fd_flags_reader read_flags);

static const char *classifier_mode;

static int fixture_fd_flags(int fd, int *observed_errno) {
  *observed_errno = EBADF;
  if (strcmp(classifier_mode, "fd3-cloexec") == 0 && fd == 3) {
    *observed_errno = 0;
    return FD_CLOEXEC;
  }
  if (strcmp(classifier_mode, "fd3-eintr") == 0 && fd == 3) {
    *observed_errno = EINTR;
    return -1;
  }
  if (strcmp(classifier_mode, "scan-eintr") == 0 && fd == 4) {
    *observed_errno = EINTR;
    return -1;
  }
  if ((strcmp(classifier_mode, "fixture-exact") == 0 ||
       strcmp(classifier_mode, "scan-eintr") == 0) &&
      fd == 3) {
    *observed_errno = 0;
    return 0;
  }
  return -1;
}

static int child_mode(const char *mode, const char *probe) {
  int fd;
  struct rlimit limit = {256, 256};

  for (fd = 3; fd < 1024; fd++) {
    (void)close(fd);
  }
  if (setrlimit(RLIMIT_NOFILE, &limit) != 0) {
    return 126;
  }
  if (strcmp(mode, "missing") != 0) {
    fd = open("/dev/null", O_RDONLY);
    if (fd != 3) {
      return 126;
    }
  }
  if (strcmp(mode, "extra") == 0 && open("/dev/null", O_RDONLY) != 4) {
    return 126;
  }
  execl(probe, probe, (char *)NULL);
  return 127;
}

int main(int argc, char *argv[]) {
  pid_t child;
  int status;

  if (argc == 2) {
    classifier_mode = argv[1];
    if (strcmp(classifier_mode, "open-max-negative") == 0) {
      return fd_admission_probe_classify_for_test(-1, fixture_fd_flags);
    }
    if (strcmp(classifier_mode, "open-max-large") == 0) {
      return fd_admission_probe_classify_for_test(65537, fixture_fd_flags);
    }
    if (strcmp(classifier_mode, "fd3-cloexec") == 0 ||
        strcmp(classifier_mode, "fd3-eintr") == 0 ||
        strcmp(classifier_mode, "scan-eintr") == 0 ||
        strcmp(classifier_mode, "fixture-exact") == 0) {
      return fd_admission_probe_classify_for_test(8, fixture_fd_flags);
    }
    return 125;
  }
  if (argc != 3 ||
      (strcmp(argv[1], "exact") != 0 && strcmp(argv[1], "missing") != 0 &&
       strcmp(argv[1], "extra") != 0)) {
    return 125;
  }
  child = fork();
  if (child < 0) {
    return 125;
  }
  if (child == 0) {
    _exit(child_mode(argv[1], argv[2]));
  }
  if (waitpid(child, &status, 0) != child) {
    return 125;
  }
  return WIFEXITED(status) ? WEXITSTATUS(status) : 125;
}
