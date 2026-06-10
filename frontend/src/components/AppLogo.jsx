export default function AppLogo({ variant = 'horizontal', className = '' }) {
  return (
    <img
      src={`/logos/DCSMART-APP-${variant}.png`}
      alt="DCSmart"
      className={`app-logo${className ? ' ' + className : ''}`}
    />
  )
}
