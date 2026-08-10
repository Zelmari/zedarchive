#define _DARWIN_C_SOURCE 1

#include <sys/types.h>
#include <sys/stat.h>
#include <sys/attr.h>
#include <sys/acl.h>
#include <sys/file.h>
#include <sys/stdio.h>
#include <dirent.h>
#include <fcntl.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdbool.h>
#include <string.h>

#if !defined(__APPLE__) || !defined(__MACH__)
#error "exclusive promotion helper requires Darwin"
#endif

_Static_assert(RENAME_EXCL == 0x00000004, "unexpected RENAME_EXCL");
_Static_assert(RENAME_NOFOLLOW_ANY == 0x00000010,
               "unexpected RENAME_NOFOLLOW_ANY");
_Static_assert(RENAME_RESOLVE_BENEATH == 0x00000020,
               "unexpected RENAME_RESOLVE_BENEATH");
_Static_assert(O_NOFOLLOW == 0x00000100, "unexpected O_NOFOLLOW");
_Static_assert(O_CLOEXEC == 0x01000000, "unexpected O_CLOEXEC");
_Static_assert(O_EXLOCK == 0x00000020, "unexpected O_EXLOCK");

static const int source_parent_fd = 3;
static const int destination_parent_fd = 4;
static const unsigned char fixture_qualifier[16] = {
    0x7a, 0x65, 0x64, 0x61, 0x72, 0x63, 0x68, 0x69,
    0x76, 0x65, 0x2d, 0x6d, 0x34, 0x35, 0x2d, 0x31,
};

enum helper_exit {
  HELPER_SUCCESS = 0,
  HELPER_DESTINATION_EXISTS = 10,
  HELPER_UNAVAILABLE = 11,
  HELPER_SOURCE_DRIFT = 12,
  HELPER_DESTINATION_DRIFT = 13,
  HELPER_PERMISSION = 14,
  HELPER_METADATA_DRIFT = 15,
  HELPER_POST_RENAME_DRIFT = 16,
  HELPER_TERMINAL_PRESTATE = 17,
  HELPER_TERMINAL_HELPER_UNLINKED = 18,
  HELPER_TERMINAL_ROOT_REMOVED_UNPROVED = 19,
  HELPER_TERMINAL_UNCLASSIFIABLE = 20
};

struct phase_tuple {
  const char *phase;
  const char *source_name;
  const char *destination_name;
  nlink_t source_links;
  nlink_t destination_parent_links;
};

struct expected_metadata {
  uid_t owner;
  dev_t device;
  ino_t inode;
  nlink_t links;
  mode_t mode;
};

static const struct phase_tuple phase_tuples[] = {
    {"capture", ".policy-baseline-review.staging", "capture", 3, 2},
    {"role-input", ".policy-baseline-review.staging", "role-input", 9, 3},
    {"role-result", ".policy-baseline-review.staging", "role-result", 4, 4},
};

static bool parse_u64(const char *value, uint64_t *result) {
  char *end = NULL;
  unsigned long long parsed;

  if (value == NULL || value[0] == '\0' || value[0] == '-') {
    return false;
  }
  errno = 0;
  parsed = strtoull(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0') {
    return false;
  }
  *result = (uint64_t)parsed;
  return true;
}

static bool parse_metadata(const char *owner, const char *device,
                           const char *inode, const char *links,
                           const char *mode,
                           struct expected_metadata *expected) {
  uint64_t values[5];
  if (!parse_u64(owner, &values[0]) || !parse_u64(device, &values[1]) ||
      !parse_u64(inode, &values[2]) || !parse_u64(links, &values[3]) ||
      !parse_u64(mode, &values[4]) || values[2] == 0 || values[3] == 0 ||
      values[4] > 07777) {
    return false;
  }
  expected->owner = (uid_t)values[0];
  expected->device = (dev_t)values[1];
  expected->inode = (ino_t)values[2];
  expected->links = (nlink_t)values[3];
  expected->mode = (mode_t)values[4];
  return (uint64_t)expected->owner == values[0] &&
         (uint64_t)expected->device == values[1] &&
         (uint64_t)expected->inode == values[2] &&
         (uint64_t)expected->links == values[3] &&
         (uint64_t)expected->mode == values[4];
}

static bool safe_basename(const char *value) {
  return value != NULL && value[0] != '\0' && strcmp(value, ".") != 0 &&
         strcmp(value, "..") != 0 && strchr(value, '/') == NULL;
}

static bool exact_child_fd_map(int highest_fd) {
  long open_max = sysconf(_SC_OPEN_MAX);
  int fd;

  if (highest_fd < 3 || highest_fd > 6 || open_max < 0 || open_max > 65536) {
    return false;
  }
  for (fd = 3; fd <= highest_fd; fd++) {
    int flags = fcntl(fd, F_GETFD);
    if (flags < 0 || (flags & FD_CLOEXEC) != 0) {
      return false;
    }
  }
  for (fd = highest_fd + 1; fd < open_max; fd++) {
    errno = 0;
    if (fcntl(fd, F_GETFD) != -1 || errno != EBADF) {
      return false;
    }
  }
  return true;
}

static const struct phase_tuple *parse_phase(const char *phase,
                                             const char *source_name,
                                             const char *destination_name) {
  size_t index;

  if (!safe_basename(source_name) || !safe_basename(destination_name)) {
    return NULL;
  }
  for (index = 0; index < sizeof(phase_tuples) / sizeof(phase_tuples[0]);
       index++) {
    const struct phase_tuple *candidate = &phase_tuples[index];
    if (strcmp(phase, candidate->phase) == 0 &&
        strcmp(source_name, candidate->source_name) == 0 &&
        strcmp(destination_name, candidate->destination_name) == 0) {
      return candidate;
    }
  }
  return NULL;
}

static bool empty_extended_acl(int fd) {
  acl_entry_t entry;
  acl_t acl = acl_get_fd_np(fd, ACL_TYPE_EXTENDED);
  int entry_status;
  int entry_errno;
  int free_status;

  if (acl == NULL) {
    return false;
  }
  errno = 0;
  entry_status = acl_get_entry(acl, ACL_FIRST_ENTRY, &entry);
  entry_errno = errno;
  free_status = acl_free(acl);
  return entry_status == -1 && entry_errno == EINVAL && free_status == 0;
}

static bool permission_set_is_fixture(acl_permset_t permissions) {
  const acl_perm_t rejected[] = {
      ACL_READ_DATA,          ACL_WRITE_DATA,        ACL_APPEND_DATA,
      ACL_EXECUTE,            ACL_DELETE,            ACL_WRITE_ATTRIBUTES,
      ACL_READ_EXTATTRIBUTES, ACL_WRITE_EXTATTRIBUTES,
      ACL_READ_SECURITY,      ACL_WRITE_SECURITY,    ACL_CHANGE_OWNER,
      ACL_SYNCHRONIZE,
  };
  size_t index;

  if (acl_get_perm_np(permissions, ACL_READ_ATTRIBUTES) != 1) {
    return false;
  }
  for (index = 0; index < sizeof(rejected) / sizeof(rejected[0]); index++) {
    if (acl_get_perm_np(permissions, rejected[index]) != 0) {
      return false;
    }
  }
  return true;
}

static bool flag_set_is_empty(acl_flagset_t flags) {
  const acl_flag_t rejected[] = {
      ACL_ENTRY_INHERITED, ACL_ENTRY_FILE_INHERIT, ACL_ENTRY_DIRECTORY_INHERIT,
      ACL_ENTRY_LIMIT_INHERIT, ACL_ENTRY_ONLY_INHERIT,
  };
  size_t index;

  for (index = 0; index < sizeof(rejected) / sizeof(rejected[0]); index++) {
    if (acl_get_flag_np(flags, rejected[index]) != 0) {
      return false;
    }
  }
  return true;
}

static bool exact_fixture_acl(int fd) {
  acl_entry_t entry;
  acl_permset_t permissions;
  acl_flagset_t flags;
  acl_tag_t tag;
  void *qualifier = NULL;
  acl_t acl = acl_get_fd_np(fd, ACL_TYPE_EXTENDED);
  int status = 0;
  int next_status;
  int next_errno;

  if (acl == NULL || acl_get_entry(acl, ACL_FIRST_ENTRY, &entry) != 0 ||
      acl_get_tag_type(entry, &tag) != 0 || tag != ACL_EXTENDED_ALLOW ||
      acl_get_permset(entry, &permissions) != 0 ||
      acl_get_flagset_np(entry, &flags) != 0) {
    status = -1;
  } else {
    qualifier = acl_get_qualifier(entry);
    if (qualifier == NULL ||
        memcmp(qualifier, fixture_qualifier, sizeof(fixture_qualifier)) != 0 ||
        !permission_set_is_fixture(permissions) || !flag_set_is_empty(flags)) {
      status = -1;
    }
  }
  errno = 0;
  next_status = status == 0 ? acl_get_entry(acl, ACL_NEXT_ENTRY, &entry) : 0;
  next_errno = errno;
  if (status == 0 && !(next_status == -1 && next_errno == EINVAL)) {
    status = -1;
  }
  if (qualifier != NULL && acl_free(qualifier) != 0) {
    status = -1;
  }
  if (acl != NULL && acl_free(acl) != 0) {
    status = -1;
  }
  return status == 0;
}

static bool apply_fixture_acl(int fd) {
  acl_t acl = acl_init(1);
  acl_entry_t entry;
  acl_permset_t permissions;
  acl_flagset_t flags;
  int status = 0;

  if (acl == NULL || acl_create_entry(&acl, &entry) != 0 ||
      acl_set_tag_type(entry, ACL_EXTENDED_ALLOW) != 0 ||
      acl_set_qualifier(entry, fixture_qualifier) != 0 ||
      acl_get_permset(entry, &permissions) != 0 ||
      acl_clear_perms(permissions) != 0 ||
      acl_add_perm(permissions, ACL_READ_ATTRIBUTES) != 0 ||
      acl_set_permset(entry, permissions) != 0 ||
      acl_get_flagset_np(entry, &flags) != 0 ||
      acl_clear_flags_np(flags) != 0 || acl_set_flagset_np(entry, flags) != 0 ||
      acl_set_fd_np(fd, acl, ACL_TYPE_EXTENDED) != 0) {
    status = -1;
  }
  if (acl != NULL && acl_free(acl) != 0) {
    status = -1;
  }
  return status == 0 && exact_fixture_acl(fd);
}

static bool remove_fixture_acl(int fd) {
  acl_t empty;
  int status = 0;

  if (!exact_fixture_acl(fd)) {
    return false;
  }
  empty = acl_init(0);
  if (empty == NULL || acl_set_fd_np(fd, empty, ACL_TYPE_EXTENDED) != 0) {
    status = -1;
  }
  if (empty != NULL && acl_free(empty) != 0) {
    status = -1;
  }
  return status == 0 && empty_extended_acl(fd);
}

static bool rename_exclusive_capable(int fd) {
  struct attrlist attributes;
  struct {
    uint32_t length;
    vol_capabilities_attr_t capabilities;
  } result;

  memset(&attributes, 0, sizeof(attributes));
  memset(&result, 0, sizeof(result));
  attributes.bitmapcount = ATTR_BIT_MAP_COUNT;
  attributes.volattr = ATTR_VOL_INFO | ATTR_VOL_CAPABILITIES;
  if (fgetattrlist(fd, &attributes, &result, sizeof(result),
                   FSOPT_REPORT_FULLSIZE) != 0) {
    return false;
  }
  return result.length == sizeof(result) &&
         (result.capabilities.valid[VOL_CAPABILITIES_INTERFACES] &
          VOL_CAP_INT_RENAME_EXCL) != 0 &&
         (result.capabilities.capabilities[VOL_CAPABILITIES_INTERFACES] &
          VOL_CAP_INT_RENAME_EXCL) != 0;
}

static bool exact_directory(const struct stat *metadata,
                            const struct expected_metadata *expected) {
  return S_ISDIR(metadata->st_mode) && metadata->st_uid == expected->owner &&
         metadata->st_dev == expected->device &&
         metadata->st_ino == expected->inode &&
         metadata->st_nlink == expected->links &&
         (metadata->st_mode & 07777) == expected->mode;
}

static int permission_or(int fallback) {
  return errno == EPERM || errno == EACCES ? HELPER_PERMISSION : fallback;
}

enum metadata_kind { METADATA_DIRECTORY, METADATA_FILE, METADATA_LOCK };

struct metadata_role {
  const char *name;
  enum metadata_kind kind;
  mode_t mode;
  nlink_t fixed_links;
};

static const struct metadata_role metadata_roles[] = {
    {"build-root", METADATA_DIRECTORY, 0700, 5},
    {"build-tmp", METADATA_DIRECTORY, 0700, 2},
    {"build-source", METADATA_FILE, 0400, 1},
    {"build-helper", METADATA_FILE, 0500, 1},
    {"preflight-root", METADATA_DIRECTORY, 0700, 0},
    {"preflight-directory", METADATA_DIRECTORY, 0700, 0},
    {"preflight-file", METADATA_FILE, 0600, 1},
    {"custody-file", METADATA_FILE, 0600, 1},
    {"command-lock", METADATA_LOCK, 0600, 1},
};

static const struct metadata_role *parse_metadata_role(const char *name) {
  size_t index;
  for (index = 0; index < sizeof(metadata_roles) / sizeof(metadata_roles[0]);
       index++) {
    if (strcmp(name, metadata_roles[index].name) == 0) {
      return &metadata_roles[index];
    }
  }
  return NULL;
}

static int metadata_mode(int argc, char *argv[]) {
  const struct metadata_role *role;
  struct expected_metadata expected;
  struct stat observed;
  uint64_t expected_size = 0;
  bool directory;

  if (argc != 9 || (role = parse_metadata_role(argv[2])) == NULL ||
      !parse_metadata(argv[3], argv[4], argv[5], argv[6], argv[7], &expected) ||
      !exact_child_fd_map(source_parent_fd)) {
    return HELPER_DESTINATION_DRIFT;
  }
  directory = role->kind == METADATA_DIRECTORY;
  if ((directory && strcmp(argv[8], "na") != 0) ||
      (!directory && !parse_u64(argv[8], &expected_size)) ||
      (role->kind == METADATA_FILE && expected_size == 0) ||
      (role->kind == METADATA_LOCK && expected_size != 0) ||
      expected.owner != geteuid() || expected.mode != role->mode ||
      (role->fixed_links != 0 && expected.links != role->fixed_links) ||
      fstat(source_parent_fd, &observed) != 0 ||
      observed.st_uid != expected.owner || observed.st_dev != expected.device ||
      observed.st_ino != expected.inode || observed.st_nlink != expected.links ||
      (observed.st_mode & 07777) != expected.mode ||
      (directory ? !S_ISDIR(observed.st_mode) : !S_ISREG(observed.st_mode)) ||
      (!directory && (uint64_t)observed.st_size != expected_size) ||
      !empty_extended_acl(source_parent_fd)) {
    return HELPER_METADATA_DRIFT;
  }
  return HELPER_SUCCESS;
}

static int acl_fixture_mode(int argc, char *argv[]) {
  struct expected_metadata expected;
  struct stat observed;
  bool success;

  if (argc != 6 ||
      (strcmp(argv[2], "install") != 0 && strcmp(argv[2], "remove") != 0 &&
       strcmp(argv[2], "inspect-empty") != 0 &&
       strcmp(argv[2], "inspect-fixture") != 0) ||
      !parse_metadata(argv[3], argv[4], argv[5], "2", "448", &expected) ||
      !exact_child_fd_map(source_parent_fd)) {
    return HELPER_DESTINATION_DRIFT;
  }
  if (expected.owner != geteuid() || fstat(source_parent_fd, &observed) != 0 ||
      !exact_directory(&observed, &expected)) {
    return HELPER_METADATA_DRIFT;
  }
  if (strcmp(argv[2], "inspect-empty") == 0) {
    success = empty_extended_acl(source_parent_fd);
  } else if (strcmp(argv[2], "inspect-fixture") == 0) {
    success = exact_fixture_acl(source_parent_fd);
  } else if (strcmp(argv[2], "install") == 0) {
    success = empty_extended_acl(source_parent_fd) &&
              apply_fixture_acl(source_parent_fd);
  } else {
    success = remove_fixture_acl(source_parent_fd);
  }
  return success ? HELPER_SUCCESS : HELPER_METADATA_DRIFT;
}

static int promotion_mode(int argc, char *argv[]) {
  const struct phase_tuple *phase;
  struct expected_metadata source_parent_expected;
  struct expected_metadata destination_parent_expected;
  struct expected_metadata staging_expected;
  struct stat source_parent;
  struct stat destination_parent;
  struct stat source_parent_after;
  struct stat destination_parent_after;
  struct stat source_before;
  struct stat source_opened;
  struct stat destination_after;
  struct stat destination_opened;
  int source_fd = -1;
  int status;
  int (*const checked_renameatx_np)(int, const char *, int, const char *,
                                    unsigned int) = renameatx_np;

  if (argc != 12 ||
      (phase = parse_phase(argv[1], argv[2], argv[3])) == NULL ||
      !parse_metadata("0", argv[4], argv[5], argv[6], "448",
                      &source_parent_expected) ||
      !parse_metadata("0", argv[7], argv[8], argv[9], "448",
                      &destination_parent_expected) ||
      !parse_metadata("0", argv[10], argv[11], "1", "448",
                      &staging_expected) ||
      !exact_child_fd_map(destination_parent_fd)) {
    return HELPER_DESTINATION_DRIFT;
  }
  source_parent_expected.owner = geteuid();
  destination_parent_expected.owner = geteuid();
  staging_expected.owner = geteuid();
  staging_expected.links = phase->source_links;
  if (destination_parent_expected.links != phase->destination_parent_links ||
      fstat(source_parent_fd, &source_parent) != 0 ||
      fstat(destination_parent_fd, &destination_parent) != 0) {
    return permission_or(HELPER_DESTINATION_DRIFT);
  }
  if (!exact_directory(&source_parent, &source_parent_expected) ||
      !exact_directory(&destination_parent, &destination_parent_expected) ||
      source_parent.st_dev != destination_parent.st_dev ||
      source_parent.st_dev != staging_expected.device ||
      !empty_extended_acl(source_parent_fd) ||
      !empty_extended_acl(destination_parent_fd)) {
    return HELPER_METADATA_DRIFT;
  }
  if (!rename_exclusive_capable(source_parent_fd)) {
    return HELPER_UNAVAILABLE;
  }
  if (fstatat(source_parent_fd, phase->source_name, &source_before,
              AT_SYMLINK_NOFOLLOW) != 0) {
    return permission_or(HELPER_SOURCE_DRIFT);
  }
  if (!exact_directory(&source_before, &staging_expected)) {
    return HELPER_SOURCE_DRIFT;
  }
  source_fd = openat(source_parent_fd, phase->source_name,
                     O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (source_fd < 0 || fstat(source_fd, &source_opened) != 0 ||
      !exact_directory(&source_opened, &staging_expected) ||
      !empty_extended_acl(source_fd)) {
    if (source_fd >= 0) {
      (void)close(source_fd);
    }
    return permission_or(HELPER_SOURCE_DRIFT);
  }
  if (close(source_fd) != 0) {
    return HELPER_SOURCE_DRIFT;
  }

  status = checked_renameatx_np(
      source_parent_fd, phase->source_name, destination_parent_fd,
      phase->destination_name,
      RENAME_EXCL | RENAME_NOFOLLOW_ANY | RENAME_RESOLVE_BENEATH);
  if (status != 0) {
    if (errno == EEXIST) {
      return HELPER_DESTINATION_EXISTS;
    }
    if (errno == ENOTSUP || errno == EOPNOTSUPP || errno == EINVAL ||
        errno == ENOSYS || errno == EXDEV) {
      return HELPER_UNAVAILABLE;
    }
    if (errno == EPERM || errno == EACCES) {
      return HELPER_PERMISSION;
    }
    return HELPER_DESTINATION_DRIFT;
  }
  if (fstatat(destination_parent_fd, phase->destination_name,
              &destination_after, AT_SYMLINK_NOFOLLOW) != 0 ||
      (errno = 0,
       fstatat(source_parent_fd, phase->source_name, &source_before,
               AT_SYMLINK_NOFOLLOW)) != -1 ||
      errno != ENOENT || fstat(source_parent_fd, &source_parent_after) != 0 ||
      fstat(destination_parent_fd, &destination_parent_after) != 0 ||
      source_parent_after.st_uid != source_parent.st_uid ||
      source_parent_after.st_dev != source_parent.st_dev ||
      source_parent_after.st_ino != source_parent.st_ino ||
      source_parent_after.st_nlink + 1 != source_parent.st_nlink ||
      (source_parent_after.st_mode & 07777) != 0700 ||
      destination_parent_after.st_uid != destination_parent.st_uid ||
      destination_parent_after.st_dev != destination_parent.st_dev ||
      destination_parent_after.st_ino != destination_parent.st_ino ||
      destination_parent_after.st_nlink != destination_parent.st_nlink + 1 ||
      (destination_parent_after.st_mode & 07777) != 0700 ||
      !empty_extended_acl(source_parent_fd) ||
      !empty_extended_acl(destination_parent_fd) ||
      !exact_directory(&destination_after, &staging_expected)) {
    return HELPER_POST_RENAME_DRIFT;
  }
  source_fd = openat(destination_parent_fd, phase->destination_name,
                     O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (source_fd < 0 || fstat(source_fd, &destination_opened) != 0 ||
      !exact_directory(&destination_opened, &staging_expected) ||
      !empty_extended_acl(source_fd)) {
    if (source_fd >= 0) {
      (void)close(source_fd);
    }
    return HELPER_POST_RENAME_DRIFT;
  }
  if (close(source_fd) != 0) {
    return HELPER_POST_RENAME_DRIFT;
  }
  return HELPER_SUCCESS;
}

enum delete_kind { DELETE_REGULAR_FILE, DELETE_EMPTY_DIRECTORY };

struct delete_role {
  const char *name;
  const char *parent_role;
  const char *basename;
  enum delete_kind kind;
  mode_t mode;
  off_t fixed_size;
};

static const struct delete_role delete_roles[] = {
    {"build-source", "m45-build-root", "exclusive-promotion-helper.c",
     DELETE_REGULAR_FILE, 0400, -1},
    {"build-helper", "m45-build-root", "exclusive-promotion-helper",
     DELETE_REGULAR_FILE, 0500, -1},
    {"build-tmp", "m45-build-root", "tmp", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"build-root", "m45-root", ".policy-exclusive-promotion-build",
     DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-success-source-file", "preflight-success-source",
     "fixture.bin", DELETE_REGULAR_FILE, 0600,
     (off_t)(sizeof("zedarchive-m45-exclusive-success-source-v1\n") - 1)},
    {"preflight-success-destination-file", "preflight-success-destination",
     "fixture.bin", DELETE_REGULAR_FILE, 0600,
     (off_t)(sizeof("zedarchive-m45-exclusive-success-destination-v1\n") - 1)},
    {"preflight-collision-source-file", "preflight-collision-source",
     "fixture.bin", DELETE_REGULAR_FILE, 0600,
     (off_t)(sizeof("zedarchive-m45-exclusive-collision-source-v1\n") - 1)},
    {"preflight-collision-destination-file",
     "preflight-collision-destination", "fixture.bin", DELETE_REGULAR_FILE,
     0600,
     (off_t)(sizeof("zedarchive-m45-exclusive-collision-destination-v1\n") -
             1)},
    {"preflight-success-destination-promotion",
     "preflight-success-destination", "promotion", DELETE_EMPTY_DIRECTORY,
     0700, 0},
    {"preflight-success-source-promotion", "preflight-success-source",
     "promotion", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-collision-source-promotion", "preflight-collision-source",
     "promotion", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-collision-destination-promotion",
     "preflight-collision-destination", "promotion", DELETE_EMPTY_DIRECTORY,
     0700, 0},
    {"preflight-success-source-directory", "preflight-root", "success-source",
     DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-success-destination-directory", "preflight-root",
     "success-destination", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-collision-source-directory", "preflight-root",
     "collision-source", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-collision-destination-directory", "preflight-root",
     "collision-destination", DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-acl-fixture-directory", "preflight-root", "acl-fixture",
     DELETE_EMPTY_DIRECTORY, 0700, 0},
    {"preflight-root", "m45-root",
     ".policy-exclusive-promotion-preflight", DELETE_EMPTY_DIRECTORY, 0700,
     0},
};

static const char *const build_source_before[] = {
    "exclusive-promotion-helper.c", "exclusive-promotion-helper", "tmp"};
static const char *const build_source_after[] = {
    "exclusive-promotion-helper", "tmp"};
static const char *const build_helper_before[] = {
    "exclusive-promotion-helper", "tmp"};
static const char *const build_helper_after[] = {"tmp"};
static const char *const terminal_helper_only[] = {
    "exclusive-promotion-helper"};
static const char *const build_tmp_before[] = {"exclusive-promotion-helper",
                                               "tmp"};
static const char *const build_tmp_after[] = {"exclusive-promotion-helper"};
static const char *const m45_build_before[] = {
    ".policy-exclusive-promotion.lock",
    ".policy-exclusive-promotion-build"};
static const char *const m45_preflight_before[] = {
    ".policy-exclusive-promotion.lock",
    ".policy-exclusive-promotion-preflight"};
static const char *const m45_after[] = {
    ".policy-exclusive-promotion.lock"};
static const char *const shared_terminal_before[] = {
    "candidate-review", "discovery", "predecessor-review",
    "policy-native-derivation", ".policy-exclusive-promotion.lock",
    ".policy-exclusive-promotion-build"};
static const char *const shared_terminal_after[] = {
    "candidate-review", "discovery", "predecessor-review",
    "policy-native-derivation", ".policy-exclusive-promotion.lock"};
static const char *const shared_control_a[] = {"shared-root-baseline.v1.json"};
static const char *const shared_control_b[] = {"shared-root-baseline.v1.json",
                                                "stage-a.v1.json"};
static const char *const fixture_before[] = {"fixture.bin"};
static const char *const fixture_and_promotion[] = {"fixture.bin",
                                                    "promotion"};
static const char *const preflight_five[] = {
    "success-source", "success-destination", "collision-source",
    "collision-destination", "acl-fixture"};
static const char *const preflight_four[] = {
    "success-destination", "collision-source", "collision-destination",
    "acl-fixture"};
static const char *const preflight_three[] = {
    "collision-source", "collision-destination", "acl-fixture"};
static const char *const preflight_two[] = {"collision-destination",
                                            "acl-fixture"};
static const char *const preflight_one[] = {"acl-fixture"};

struct expected_inventory {
  const char *const *names;
  size_t count;
};

#define INVENTORY(value)                                                     \
  (struct expected_inventory) { value, sizeof(value) / sizeof(value[0]) }

static struct expected_inventory deletion_inventory(
    const struct delete_role *role, bool after) {
  if (strcmp(role->name, "build-source") == 0) {
    return after ? INVENTORY(build_source_after)
                 : INVENTORY(build_source_before);
  }
  if (strcmp(role->name, "build-helper") == 0) {
    return after ? INVENTORY(build_helper_after)
                 : INVENTORY(build_helper_before);
  }
  if (strcmp(role->name, "build-tmp") == 0) {
    return after ? INVENTORY(build_tmp_after) : INVENTORY(build_tmp_before);
  }
  if (strcmp(role->name, "build-root") == 0) {
    return after ? INVENTORY(m45_after) : INVENTORY(m45_build_before);
  }
  if (strstr(role->name, "-file") != NULL) {
    return after ? (struct expected_inventory){NULL, 0}
                 : INVENTORY(fixture_before);
  }
  if (strstr(role->name, "-promotion") != NULL) {
    return after ? INVENTORY(fixture_before)
                 : INVENTORY(fixture_and_promotion);
  }
  if (strcmp(role->name, "preflight-success-source-directory") == 0) {
    return after ? INVENTORY(preflight_four) : INVENTORY(preflight_five);
  }
  if (strcmp(role->name, "preflight-success-destination-directory") == 0) {
    return after ? INVENTORY(preflight_three) : INVENTORY(preflight_four);
  }
  if (strcmp(role->name, "preflight-collision-source-directory") == 0) {
    return after ? INVENTORY(preflight_two) : INVENTORY(preflight_three);
  }
  if (strcmp(role->name, "preflight-collision-destination-directory") == 0) {
    return after ? INVENTORY(preflight_one) : INVENTORY(preflight_two);
  }
  if (strcmp(role->name, "preflight-acl-fixture-directory") == 0) {
    return after ? (struct expected_inventory){NULL, 0}
                 : INVENTORY(preflight_one);
  }
  if (strcmp(role->name, "preflight-root") == 0) {
    return after ? INVENTORY(m45_after) : INVENTORY(m45_preflight_before);
  }
  return (struct expected_inventory){NULL, SIZE_MAX};
}

static bool exact_directory_inventory(int fd,
                                      struct expected_inventory expected) {
  int duplicate;
  DIR *directory;
  struct dirent *entry;
  size_t observed = 0;
  bool valid = expected.count != SIZE_MAX;

  duplicate = openat(fd, ".",
                     O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (!valid || duplicate < 0 || (directory = fdopendir(duplicate)) == NULL) {
    if (duplicate >= 0) {
      (void)close(duplicate);
    }
    return false;
  }
  errno = 0;
  while ((entry = readdir(directory)) != NULL) {
    size_t index;
    bool found = false;
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    for (index = 0; index < expected.count; index++) {
      if (strcmp(entry->d_name, expected.names[index]) == 0) {
        found = true;
        break;
      }
    }
    if (!found) {
      valid = false;
    }
    observed++;
  }
  if (errno != 0 || observed != expected.count || closedir(directory) != 0) {
    valid = false;
  }
  return valid;
}

static const struct delete_role *parse_delete_role(const char *name) {
  size_t index;
  for (index = 0; index < sizeof(delete_roles) / sizeof(delete_roles[0]);
       index++) {
    if (strcmp(name, delete_roles[index].name) == 0) {
      return &delete_roles[index];
    }
  }
  return NULL;
}

static bool exact_lock(int fd, dev_t device);

static int preflight_promotion_mode(int argc, char *argv[]) {
  struct expected_metadata source_parent_expected;
  struct expected_metadata destination_parent_expected;
  struct expected_metadata source_promotion_expected;
  struct expected_metadata collision_destination_expected;
  struct stat source_parent_before;
  struct stat destination_parent_before;
  struct stat source_promotion_before;
  struct stat source_named;
  struct stat destination_named;
  struct stat source_parent_after;
  struct stat destination_parent_after;
  struct stat source_promotion_after;
  uint64_t source_post_links;
  uint64_t destination_post_links;
  uint64_t collision_destination_device;
  uint64_t collision_destination_inode;
  uint64_t collision_destination_links;
  uint64_t common_device;
  bool collision;
  int rename_status;
  const char *const source_inventory[] = {"fixture.bin", "promotion"};
  const char *const success_destination_before[] = {"fixture.bin"};
  const char *const collision_destination_before[] = {"fixture.bin",
                                                       "promotion"};

  if (argc != 18 ||
      (strcmp(argv[2], "success") != 0 &&
       strcmp(argv[2], "collision") != 0) ||
      !parse_metadata("0", argv[3], argv[4], argv[5], "448",
                      &source_parent_expected) ||
      !parse_u64(argv[6], &source_post_links) ||
      !parse_metadata("0", argv[7], argv[8], argv[9], "448",
                      &destination_parent_expected) ||
      !parse_u64(argv[10], &destination_post_links) ||
      !parse_metadata("0", argv[11], argv[12], argv[13], "448",
                      &source_promotion_expected) ||
      !parse_u64(argv[14], &collision_destination_device) ||
      !parse_u64(argv[15], &collision_destination_inode) ||
      !parse_u64(argv[16], &collision_destination_links) ||
      !parse_u64(argv[17], &common_device) || !exact_child_fd_map(6)) {
    return HELPER_DESTINATION_DRIFT;
  }
  collision = strcmp(argv[2], "collision") == 0;
  source_parent_expected.owner = geteuid();
  destination_parent_expected.owner = geteuid();
  source_promotion_expected.owner = geteuid();
  collision_destination_expected.owner = geteuid();
  collision_destination_expected.device =
      (dev_t)collision_destination_device;
  collision_destination_expected.inode =
      (ino_t)collision_destination_inode;
  collision_destination_expected.links =
      (nlink_t)collision_destination_links;
  collision_destination_expected.mode = 0700;
  if ((uint64_t)collision_destination_expected.device !=
          collision_destination_device ||
      (uint64_t)collision_destination_expected.inode !=
          collision_destination_inode ||
      (uint64_t)collision_destination_expected.links !=
          collision_destination_links ||
      (uint64_t)(dev_t)common_device != common_device ||
      source_parent_expected.device != (dev_t)common_device ||
      destination_parent_expected.device != (dev_t)common_device ||
      source_promotion_expected.device != (dev_t)common_device ||
      source_promotion_expected.links != 2 ||
      source_parent_expected.links != 4 ||
      source_post_links != (uint64_t)(collision ? 4 : 3) ||
      destination_parent_expected.links != (collision ? 4 : 3) ||
      destination_post_links != (collision ? 4 : 4) ||
      (!collision &&
       (collision_destination_expected.device != 0 ||
        collision_destination_expected.inode != 0 ||
        collision_destination_expected.links != 0)) ||
      (collision &&
       (collision_destination_expected.device != (dev_t)common_device ||
        collision_destination_expected.inode == 0 ||
        collision_destination_expected.links != 2)) ||
      !exact_lock(3, (dev_t)common_device) || flock(3, LOCK_EX | LOCK_NB) != 0 ||
      fstat(4, &source_parent_before) != 0 ||
      fstat(5, &destination_parent_before) != 0 ||
      fstat(6, &source_promotion_before) != 0 ||
      !exact_directory(&source_parent_before, &source_parent_expected) ||
      !exact_directory(&destination_parent_before,
                       &destination_parent_expected) ||
      !exact_directory(&source_promotion_before, &source_promotion_expected) ||
      !empty_extended_acl(4) || !empty_extended_acl(5) ||
      !empty_extended_acl(6) ||
      !exact_directory_inventory(4, INVENTORY(source_inventory)) ||
      !exact_directory_inventory(
          5, collision ? INVENTORY(collision_destination_before)
                       : INVENTORY(success_destination_before)) ||
      fstatat(4, "promotion", &source_named, AT_SYMLINK_NOFOLLOW) != 0 ||
      source_named.st_dev != source_promotion_before.st_dev ||
      source_named.st_ino != source_promotion_before.st_ino ||
      !rename_exclusive_capable(4)) {
    return HELPER_METADATA_DRIFT;
  }
  errno = 0;
  if (collision) {
    if (fstatat(5, "promotion", &destination_named, AT_SYMLINK_NOFOLLOW) != 0 ||
        !exact_directory(&destination_named,
                         &collision_destination_expected)) {
      return HELPER_METADATA_DRIFT;
    }
  } else if (fstatat(5, "promotion", &destination_named,
                     AT_SYMLINK_NOFOLLOW) != -1 ||
             errno != ENOENT) {
    return HELPER_DESTINATION_DRIFT;
  }
  rename_status = renameatx_np(
      4, "promotion", 5, "promotion",
      RENAME_EXCL | RENAME_NOFOLLOW_ANY | RENAME_RESOLVE_BENEATH);
  if (collision) {
    if (rename_status != -1 || errno != EEXIST ||
        fstat(4, &source_parent_after) != 0 ||
        fstat(5, &destination_parent_after) != 0 ||
        fstat(6, &source_promotion_after) != 0 ||
        !exact_directory(&source_parent_after, &source_parent_expected) ||
        !exact_directory(&destination_parent_after,
                         &destination_parent_expected) ||
        !exact_directory(&source_promotion_after,
                         &source_promotion_expected) ||
        !exact_directory_inventory(4, INVENTORY(source_inventory)) ||
        !exact_directory_inventory(5,
                                   INVENTORY(collision_destination_before)) ||
        !exact_lock(3, (dev_t)common_device)) {
      return HELPER_POST_RENAME_DRIFT;
    }
    return HELPER_DESTINATION_EXISTS;
  }
  source_parent_expected.links = (nlink_t)source_post_links;
  destination_parent_expected.links = (nlink_t)destination_post_links;
  if (rename_status != 0 || fstat(4, &source_parent_after) != 0 ||
      fstat(5, &destination_parent_after) != 0 ||
      fstat(6, &source_promotion_after) != 0 ||
      !exact_directory(&source_parent_after, &source_parent_expected) ||
      !exact_directory(&destination_parent_after,
                       &destination_parent_expected) ||
      !exact_directory(&source_promotion_after, &source_promotion_expected) ||
      !exact_directory_inventory(4, INVENTORY(fixture_before)) ||
      !exact_directory_inventory(5, INVENTORY(fixture_and_promotion)) ||
      fstatat(5, "promotion", &destination_named, AT_SYMLINK_NOFOLLOW) != 0 ||
      destination_named.st_dev != source_promotion_before.st_dev ||
      destination_named.st_ino != source_promotion_before.st_ino ||
      !empty_extended_acl(4) || !empty_extended_acl(5) ||
      !empty_extended_acl(6) || !exact_lock(3, (dev_t)common_device)) {
    return HELPER_POST_RENAME_DRIFT;
  }
  return HELPER_SUCCESS;
}

static bool exact_lock(int fd, dev_t device) {
  struct stat observed;
  return fstat(fd, &observed) == 0 && S_ISREG(observed.st_mode) &&
         observed.st_uid == geteuid() && observed.st_dev == device &&
         observed.st_nlink == 1 && observed.st_size == 0 &&
         (observed.st_mode & 07777) == 0600 && empty_extended_acl(fd);
}

static int delete_entry_mode(int argc, char *argv[]) {
  const struct delete_role *role;
  struct expected_metadata parent_expected;
  struct expected_metadata child_expected;
  struct stat parent_before;
  struct stat parent_after;
  struct stat child_before;
  struct stat child_named;
  struct stat child_after;
  uint64_t child_size = 0;
  int unlink_flags;

  if (argc != 15 || (role = parse_delete_role(argv[2])) == NULL ||
      !parse_metadata(argv[3], argv[4], argv[5], argv[6], argv[7],
                      &parent_expected) ||
      strcmp(argv[8], "na") != 0 ||
      !parse_metadata(argv[9], argv[10], argv[11], argv[12], argv[13],
                      &child_expected) ||
      (role->kind == DELETE_REGULAR_FILE
           ? !parse_u64(argv[14], &child_size)
           : strcmp(argv[14], "na") != 0) ||
      !exact_child_fd_map(5)) {
    return HELPER_DESTINATION_DRIFT;
  }
  if (parent_expected.owner != geteuid() || parent_expected.mode != 0700 ||
      parent_expected.links !=
          (nlink_t)(2 + deletion_inventory(role, false).count) ||
      child_expected.owner != geteuid() || child_expected.mode != role->mode ||
      child_expected.device != parent_expected.device ||
      (role->kind == DELETE_REGULAR_FILE &&
       (child_expected.links != 1 || child_size == 0)) ||
      (role->fixed_size > 0 && child_size != (uint64_t)role->fixed_size) ||
      (role->kind == DELETE_EMPTY_DIRECTORY && child_expected.links != 2) ||
      fstat(destination_parent_fd, &parent_before) != 0 ||
      !exact_directory(&parent_before, &parent_expected) ||
      !empty_extended_acl(destination_parent_fd) ||
      !exact_lock(source_parent_fd, parent_before.st_dev) ||
      !exact_directory_inventory(destination_parent_fd,
                                 deletion_inventory(role, false)) ||
      !exact_lock(source_parent_fd, parent_expected.device) ||
      flock(source_parent_fd, LOCK_EX | LOCK_NB) != 0 ||
      fstat(5, &child_before) != 0 ||
      fstatat(destination_parent_fd, role->basename, &child_named,
              AT_SYMLINK_NOFOLLOW) != 0 ||
      child_before.st_uid != child_expected.owner ||
      child_before.st_dev != child_expected.device ||
      child_before.st_ino != child_expected.inode ||
      child_before.st_nlink != child_expected.links ||
      (child_before.st_mode & 07777) != child_expected.mode ||
      child_named.st_dev != child_before.st_dev ||
      child_named.st_ino != child_before.st_ino ||
      (role->kind == DELETE_REGULAR_FILE
           ? (!S_ISREG(child_before.st_mode) ||
              (uint64_t)child_before.st_size != child_size)
           : !S_ISDIR(child_before.st_mode)) ||
      !empty_extended_acl(5)) {
    return HELPER_METADATA_DRIFT;
  }
  unlink_flags = role->kind == DELETE_EMPTY_DIRECTORY ? AT_REMOVEDIR : 0;
  if (unlinkat(destination_parent_fd, role->basename, unlink_flags) != 0) {
    return permission_or(HELPER_DESTINATION_DRIFT);
  }
  errno = 0;
  if (fstat(5, &child_after) != 0 || child_after.st_uid != child_before.st_uid ||
      child_after.st_dev != child_before.st_dev ||
      child_after.st_ino != child_before.st_ino || child_after.st_nlink != 0 ||
      (child_after.st_mode & 07777) != (child_before.st_mode & 07777) ||
      fstatat(destination_parent_fd, role->basename, &child_named,
              AT_SYMLINK_NOFOLLOW) != -1 ||
      errno != ENOENT || fstat(destination_parent_fd, &parent_after) != 0 ||
      parent_after.st_uid != parent_before.st_uid ||
      parent_after.st_dev != parent_before.st_dev ||
      parent_after.st_ino != parent_before.st_ino ||
      parent_after.st_nlink + 1 != parent_before.st_nlink ||
      parent_after.st_nlink !=
          (nlink_t)(2 + deletion_inventory(role, true).count) ||
      (parent_after.st_mode & 07777) != 0700 ||
      !empty_extended_acl(5) ||
      !empty_extended_acl(destination_parent_fd) ||
      !exact_directory_inventory(destination_parent_fd,
                                 deletion_inventory(role, true))) {
    return HELPER_POST_RENAME_DRIFT;
  }
  return HELPER_SUCCESS;
}

static int terminal_state(const struct expected_metadata *parent_expected,
                          const struct expected_metadata *build_expected,
                          const struct expected_metadata *helper_expected,
                          uint64_t helper_size) {
  struct stat parent;
  struct stat build;
  struct stat helper;
  struct stat named;
  bool helper_named;
  bool build_named;

  if (fstat(4, &parent) != 0 || fstat(5, &build) != 0 ||
      fstat(6, &helper) != 0 || parent.st_uid != parent_expected->owner ||
      parent.st_dev != parent_expected->device ||
      parent.st_ino != parent_expected->inode ||
      (parent.st_mode & 07777) != 0700 || !S_ISDIR(parent.st_mode) ||
      build.st_uid != build_expected->owner ||
      build.st_dev != build_expected->device ||
      build.st_ino != build_expected->inode ||
      (build.st_mode & 07777) != 0700 || !S_ISDIR(build.st_mode) ||
      helper.st_uid != helper_expected->owner ||
      helper.st_dev != helper_expected->device ||
      helper.st_ino != helper_expected->inode ||
      (helper.st_mode & 07777) != 0500 || !S_ISREG(helper.st_mode) ||
      (uint64_t)helper.st_size != helper_size || !empty_extended_acl(4) ||
      !empty_extended_acl(5) || !empty_extended_acl(6)) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  errno = 0;
  helper_named =
      fstatat(5, "exclusive-promotion-helper", &named, AT_SYMLINK_NOFOLLOW) ==
      0;
  if (!helper_named && errno != ENOENT) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  if (helper_named &&
      (named.st_dev != helper.st_dev || named.st_ino != helper.st_ino)) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  errno = 0;
  build_named = fstatat(4, ".policy-exclusive-promotion-build", &named,
                        AT_SYMLINK_NOFOLLOW) == 0;
  if (!build_named && errno != ENOENT) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  if (build_named &&
      (named.st_dev != build.st_dev || named.st_ino != build.st_ino)) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  if (parent.st_nlink == 4 && build.st_nlink == 3 && helper.st_nlink == 1 &&
      build_named && helper_named &&
      exact_directory_inventory(4, INVENTORY(m45_build_before)) &&
      exact_directory_inventory(5, INVENTORY(terminal_helper_only))) {
    return HELPER_TERMINAL_PRESTATE;
  }
  if (parent.st_nlink == 4 && build.st_nlink == 2 && helper.st_nlink == 0 &&
      build_named && !helper_named &&
      exact_directory_inventory(4, INVENTORY(m45_build_before)) &&
      exact_directory_inventory(5,
                                (struct expected_inventory){NULL, 0})) {
    return HELPER_TERMINAL_HELPER_UNLINKED;
  }
  if (parent.st_nlink == 3 && build.st_nlink == 0 && helper.st_nlink == 0 &&
      !build_named && !helper_named &&
      exact_directory_inventory(4, INVENTORY(m45_after)) &&
      exact_directory_inventory(5,
                                (struct expected_inventory){NULL, 0})) {
    return HELPER_TERMINAL_ROOT_REMOVED_UNPROVED;
  }
  return HELPER_TERMINAL_UNCLASSIFIABLE;
}

static int delete_build_terminal_mode(int argc, char *argv[]) {
  struct expected_metadata parent_expected;
  struct expected_metadata build_expected;
  struct expected_metadata helper_expected;
  struct stat helper_after;
  uint64_t helper_size;
  int state;

  if (argc != 20 ||
      !parse_metadata(argv[2], argv[3], argv[4], argv[5], argv[6],
                      &parent_expected) ||
      strcmp(argv[7], "na") != 0 ||
      !parse_metadata(argv[8], argv[9], argv[10], argv[11], argv[12],
                      &build_expected) ||
      strcmp(argv[13], "na") != 0 ||
      !parse_metadata(argv[14], argv[15], argv[16], argv[17], argv[18],
                      &helper_expected) ||
      !parse_u64(argv[19], &helper_size) || helper_size == 0 ||
      !exact_child_fd_map(6) || parent_expected.owner != geteuid() ||
      parent_expected.mode != 0700 || parent_expected.links != 4 ||
      build_expected.owner != geteuid() || build_expected.mode != 0700 ||
      build_expected.links != 3 ||
      build_expected.device != parent_expected.device ||
      helper_expected.owner != geteuid() || helper_expected.mode != 0500 ||
      helper_expected.links != 1 ||
      helper_expected.device != parent_expected.device ||
      !exact_lock(3, parent_expected.device) ||
      flock(3, LOCK_EX | LOCK_NB) != 0) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  state = terminal_state(&parent_expected, &build_expected, &helper_expected,
                         helper_size);
  if (state != HELPER_TERMINAL_PRESTATE) {
    return state;
  }
  if (unlinkat(5, "exclusive-promotion-helper", 0) != 0) {
    return terminal_state(&parent_expected, &build_expected, &helper_expected,
                          helper_size);
  }
  state = terminal_state(&parent_expected, &build_expected, &helper_expected,
                         helper_size);
  if (state != HELPER_TERMINAL_HELPER_UNLINKED) {
    return state;
  }
  if (unlinkat(4, ".policy-exclusive-promotion-build", AT_REMOVEDIR) != 0) {
    return terminal_state(&parent_expected, &build_expected, &helper_expected,
                          helper_size);
  }
  state = terminal_state(&parent_expected, &build_expected, &helper_expected,
                         helper_size);
  if (state != HELPER_TERMINAL_ROOT_REMOVED_UNPROVED ||
      fstat(6, &helper_after) != 0 || helper_after.st_nlink != 0 ||
      !exact_lock(3, parent_expected.device)) {
    return state;
  }
  return HELPER_SUCCESS;
}

static bool parse_evidence(char *argv[], int offset,
                           struct expected_metadata *expected) {
  uint64_t size;
  return parse_metadata(argv[offset], argv[offset + 1], argv[offset + 2],
                        argv[offset + 3], argv[offset + 4], expected) &&
         ((strcmp(argv[offset + 5], "na") == 0) ||
          (parse_u64(argv[offset + 5], &size) && size > 0));
}

static bool exact_shared_sibling(int parent_fd, const char *name,
                                 const struct expected_metadata *expected) {
  struct stat observed;
  return fstatat(parent_fd, name, &observed, AT_SYMLINK_NOFOLLOW) == 0 &&
         exact_directory(&observed, expected) && empty_extended_acl(parent_fd);
}

static int delete_build_terminal_shared_mode(int argc, char *argv[]) {
  struct expected_metadata parent_expected;
  struct expected_metadata build_expected;
  struct expected_metadata helper_expected;
  struct expected_metadata siblings[4];
  struct stat parent_before;
  struct stat parent_after;
  struct stat build_before;
  struct stat helper_before;
  struct stat named;
  const char *const sibling_names[] = {
      "candidate-review", "discovery", "predecessor-review",
      "policy-native-derivation"};
  struct expected_inventory control_inventory;
  int control_fd = -1;
  int control_close_status;
  bool control_inventory_valid;
  int index;

  if (argc != 45 ||
      (strcmp(argv[2], "shared-a") != 0 && strcmp(argv[2], "shared-b") != 0) ||
      !parse_evidence(argv, 3, &parent_expected) ||
      !parse_evidence(argv, 9, &build_expected) ||
      !parse_evidence(argv, 15, &helper_expected) || !exact_child_fd_map(6) ||
      parent_expected.owner != geteuid() || parent_expected.mode != 0700 ||
      parent_expected.links != 8 ||
      build_expected.owner != geteuid() || build_expected.mode != 0700 ||
      build_expected.links != 3 ||
      helper_expected.owner != geteuid() || helper_expected.mode != 0500 ||
      helper_expected.links != 1 ||
      build_expected.device != parent_expected.device ||
      helper_expected.device != parent_expected.device ||
      !exact_lock(3, parent_expected.device) || flock(3, LOCK_EX | LOCK_NB) != 0 ||
      fstat(4, &parent_before) != 0 || fstat(5, &build_before) != 0 ||
      fstat(6, &helper_before) != 0 ||
      !exact_directory(&parent_before, &parent_expected) ||
      !exact_directory(&build_before, &build_expected) ||
      !S_ISREG(helper_before.st_mode) || helper_before.st_uid != helper_expected.owner ||
      helper_before.st_dev != helper_expected.device || helper_before.st_ino != helper_expected.inode ||
      helper_before.st_nlink != helper_expected.links ||
      (helper_before.st_mode & 07777) != helper_expected.mode ||
      helper_before.st_size <= 0 ||
      !empty_extended_acl(4) || !empty_extended_acl(5) ||
      !empty_extended_acl(6) ||
      !exact_directory_inventory(4, INVENTORY(shared_terminal_before)) ||
      !exact_directory_inventory(5, INVENTORY(terminal_helper_only))) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  for (index = 0; index < 4; index++) {
    if (!parse_evidence(argv, 21 + index * 6, &siblings[index]) ||
        siblings[index].owner != geteuid() ||
        siblings[index].device != parent_expected.device ||
        siblings[index].links < 2 ||
        (index == 3 &&
         siblings[index].links !=
             (strcmp(argv[2], "shared-a") == 0 ? 3 : 4)) ||
        !exact_shared_sibling(4, sibling_names[index], &siblings[index])) {
      return HELPER_TERMINAL_UNCLASSIFIABLE;
    }
  }
  control_fd = openat(4, "policy-native-derivation",
                      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  control_inventory = strcmp(argv[2], "shared-a") == 0
                          ? INVENTORY(shared_control_a)
                          : INVENTORY(shared_control_b);
  if (control_fd < 0) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  control_inventory_valid =
      exact_directory_inventory(control_fd, control_inventory);
  control_close_status = close(control_fd);
  if (!control_inventory_valid || control_close_status != 0) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  if (unlinkat(5, "exclusive-promotion-helper", 0) != 0 ||
      fstat(6, &helper_before) != 0 || helper_before.st_nlink != 0) {
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  if (unlinkat(4, ".policy-exclusive-promotion-build", AT_REMOVEDIR) != 0) {
    return HELPER_TERMINAL_HELPER_UNLINKED;
  }
  if (fstat(4, &parent_after) != 0 || parent_after.st_uid != parent_before.st_uid ||
      parent_after.st_dev != parent_before.st_dev || parent_after.st_ino != parent_before.st_ino ||
      parent_after.st_nlink != 7 ||
      !exact_directory_inventory(4, INVENTORY(shared_terminal_after)) ||
      !exact_lock(3, parent_expected.device)) {
    return HELPER_TERMINAL_ROOT_REMOVED_UNPROVED;
  }
  for (index = 0; index < 4; index++) {
    if (!exact_shared_sibling(4, sibling_names[index], &siblings[index]))
      return HELPER_TERMINAL_UNCLASSIFIABLE;
  }
  errno = 0;
  if (fstatat(4, ".policy-exclusive-promotion-build", &named,
              AT_SYMLINK_NOFOLLOW) != -1 || errno != ENOENT)
    return HELPER_TERMINAL_UNCLASSIFIABLE;
  return HELPER_SUCCESS;
}

int main(int argc, char *argv[]) {
  if (argc > 1 && strcmp(argv[1], "metadata-check") == 0) {
    return metadata_mode(argc, argv);
  }
  if (argc > 1 && strcmp(argv[1], "acl-fixture") == 0) {
    return acl_fixture_mode(argc, argv);
  }
  if (argc > 1 && strcmp(argv[1], "delete-entry") == 0) {
    return delete_entry_mode(argc, argv);
  }
  if (argc > 1 && strcmp(argv[1], "preflight-promotion") == 0) {
    return preflight_promotion_mode(argc, argv);
  }
  if (argc > 1 && strcmp(argv[1], "delete-build-terminal") == 0) {
    return delete_build_terminal_mode(argc, argv);
  }
  if (argc > 1 && strcmp(argv[1], "delete-build-terminal-shared") == 0) {
    return delete_build_terminal_shared_mode(argc, argv);
  }
  if (argc > 1 &&
      (strcmp(argv[1], "capture") == 0 ||
       strcmp(argv[1], "role-input") == 0 ||
       strcmp(argv[1], "role-result") == 0)) {
    return promotion_mode(argc, argv);
  }
  return HELPER_DESTINATION_DRIFT;
}
