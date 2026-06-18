export default function Toast({ message, show }) {
  return (
    <div className={`toast${show ? ' show' : ''}`}>{message}</div>
  )
}
