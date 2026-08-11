#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <unistd.h>

enum {
  PROBE_EXACT = 0,
  PROBE_FD3_INVALID = 21,
  PROBE_UNEXPECTED_FD = 23,
  PROBE_OPEN_MAX_INVALID = 24,
  PROBE_SCAN_INDETERMINATE = 25,
};

typedef int (*probe_fd_flags_reader)(int fd, int *observed_errno);

#ifndef FD_ADMISSION_PROBE_TEST
static int production_fd_flags(int fd, int *observed_errno) {
  int flags;

  errno = 0;
  flags = fcntl(fd, F_GETFD);
  *observed_errno = errno;
  return flags;
}
#endif

static int classify_fd_map(long open_max, probe_fd_flags_reader read_flags) {
  int fd;
  int flags;
  int observed_errno;

  if (open_max < 0 || open_max > 65536) {
    return PROBE_OPEN_MAX_INVALID;
  }
  flags = read_flags(3, &observed_errno);
  if (flags == -1) {
    return observed_errno == EBADF ? PROBE_FD3_INVALID
                                   : PROBE_SCAN_INDETERMINATE;
  }
  if ((flags & FD_CLOEXEC) != 0) {
    return PROBE_FD3_INVALID;
  }
  for (fd = 4; fd < open_max; fd++) {
    flags = read_flags(fd, &observed_errno);
    if (flags != -1) {
      return PROBE_UNEXPECTED_FD;
    }
    if (observed_errno != EBADF) {
      return PROBE_SCAN_INDETERMINATE;
    }
  }
  return PROBE_EXACT;
}

#ifdef FD_ADMISSION_PROBE_TEST
int fd_admission_probe_classify_for_test(long open_max,
                                         probe_fd_flags_reader read_flags) {
  return classify_fd_map(open_max, read_flags);
}
#else
int main(int argc, char *argv[]) {
  (void)argv;
  if (argc != 1) {
    return PROBE_SCAN_INDETERMINATE;
  }
  return classify_fd_map(sysconf(_SC_OPEN_MAX), production_fd_flags);
}
#endif
