export default function Admin() {
  return (
    <section className="card">
      <h1>Administration</h1>
      <div className="notice">
        ยังไม่เปิดใช้งาน: ต้องตั้งค่าและทดสอบ MFA
        ที่เป็นปัจจัยอิสระก่อนเปิดสิทธิ์ Admin
      </div>
      <p>
        รายงาน การจัดการพนักงาน และการตั้งค่า provider ยังอยู่ในแผนพัฒนา
        ไม่มีการแสดงตัวเลขจำลองเป็นผลประกอบการจริง
      </p>
    </section>
  );
}
