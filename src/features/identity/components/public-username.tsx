type PublicUsernameProps = Readonly<{
  username: string
}>

export function PublicUsername({ username }: PublicUsernameProps) {
  return <>@{username}</>
}
