from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(200, 10, txt="Hemoglobin: 14.5 g/dL", ln=1, align="C")
pdf.cell(200, 10, txt="WBC: 6.5 K/uL", ln=2, align="C")
pdf.output("test.pdf")
