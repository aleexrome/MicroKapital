import { redirect } from 'next/navigation'
import { getSaturday, saturdayToId } from '@/lib/week-utils'

export default function NominaIndex() {
  redirect(`/nomina/${saturdayToId(getSaturday(new Date()))}`)
}
